import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from '../auth/auth.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'

/** Имена видеоуроков: lesson-01 … lesson-30, lesson-16-1, part2-01 … (как на сайте, `videoOf`). */
const NAME = /^(lesson-\d{2}(-\d)?|part2-\d{2})\.mp4$/
/** Ссылка Диска живёт около 30 минут: держим 20. */
const TTL = 20 * 60_000

/**
 * GET /api/video/lesson-01.mp4: видео лежат на Яндекс.Диске (папка «Видео»), отсюда браузер уходит на временную ссылку Диска
 * (перемотка работает, трафик идёт мимо сервера). Открыто всем, как и прежняя раздача видео (решение владельца: видео не закрыты токеном).
 * Включается правкой Caddy (docs/hosting.md): /video/* → /api/video/*.
 */
@Controller('video')
export class VideoController {
  private cache = new Map<string, { href: string; until: number }>()

  constructor(private readonly disk: YaDiskService) {}

  @Public()
  @Get(':name')
  async open(@Param('name') name: string, @Res() res: Response) {
    if (!NAME.test(name) || !this.disk.configured()) throw new NotFoundException({ error: 'not found' })
    let hit = this.cache.get(name)
    if (!hit || hit.until < Date.now()) {
      try {
        hit = { href: await this.disk.link(`${DISK_DIRS.video}/${name}`), until: Date.now() + TTL }
      } catch {
        throw new NotFoundException({ error: 'not found' })
      }
      this.cache.set(name, hit)
    }
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.redirect(302, hit.href)
  }
}
