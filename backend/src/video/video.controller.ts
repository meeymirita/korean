import { existsSync } from 'node:fs'
import path from 'node:path'
import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from '../auth/auth.js'
import { TOKEN, VLOG_DIR } from '../config.js'
import { signPath, verifySigned } from '../music/music.util.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'

/** Имена видеоуроков: lesson-01 … lesson-30, lesson-16-1, part2-01 … (как на сайте, `videoOf`). */
const NAME = /^(lesson-\d{2}(-\d)?|part2-\d{2})\.mp4$/
/** Имя файла видео влога = номер видео на ютубе (`yt` в `data/korean/vlogs.ts`): 11 знаков из латиницы, цифр, «-» и «_». */
export const VLOG_NAME = /^[A-Za-z0-9_-]{11}$/

/**
 * GET /api/video/lesson-01.mp4: видео лежат на Яндекс.Диске (папка korean_video в корне), отсюда браузер уходит на временную ссылку Диска
 * (перемотка работает, трафик идёт мимо сервера). Открыто всем, как и прежняя раздача видео (решение владельца: видео не закрыты токеном).
 * Включается правкой Caddy (docs/hosting.md): /video/* → /api/video/*.
 *
 * Видео влогов (чужие ролики, скачанные владельцем) наружу не открыты: `GET /api/video/vlog/<имя>/url` (с токеном) отдаёт подписанную ссылку
 * на 6 часов, `GET /api/video/vlog/<имя>/file?e&s` проверяет подпись и уводит на Диск (`korean_vlog/<имя>.mp4`) или отдаёт файл из `data/vlog/` (перемотка работает).
 */
@Controller('video')
export class VideoController {
  constructor(private readonly disk: YaDiskService) {}

  @Public()
  @Get(':name')
  async open(@Param('name') name: string, @Res() res: Response) {
    if (!NAME.test(name) || !this.disk.configured()) throw new NotFoundException({ error: 'not found' })
    let href: string
    try {
      href = await this.disk.cachedLink(`${DISK_DIRS.video}/${name}`)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.redirect(302, href)
  }

  /** Подписанная ссылка на видео влога; 404, если файла нет. */
  @Get('vlog/:name/url')
  async vlogUrl(@Param('name') name: string) {
    if (!VLOG_NAME.test(name) || !(await this.vlogExists(name))) throw new NotFoundException({ error: 'not found' })
    return { url: signPath(`/api/video/vlog/${name}/file`, TOKEN) }
  }

  @Public()
  @Get('vlog/:name/file')
  async vlogFile(@Param('name') name: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    if (!VLOG_NAME.test(name) || !verifySigned(`/api/video/vlog/${name}/file`, e, s, TOKEN)) return void res.status(403).json({ error: 'forbidden' })
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (this.disk.configured()) {
      try {
        return void res.redirect(302, await this.disk.cachedLink(`${DISK_DIRS.vlog}/${name}.mp4`))
      } catch {
        throw new NotFoundException({ error: 'not found' })
      }
    }
    const file = path.join(VLOG_DIR, `${name}.mp4`)
    if (!existsSync(file)) throw new NotFoundException({ error: 'not found' })
    // sendFile сам отвечает на запросы «с такого-то байта» (перемотка)
    res.sendFile(file, { acceptRanges: true })
  }

  private async vlogExists(name: string): Promise<boolean> {
    if (this.disk.configured()) return this.disk.exists(`${DISK_DIRS.vlog}/${name}.mp4`).catch(() => false)
    return existsSync(path.join(VLOG_DIR, `${name}.mp4`))
  }
}
