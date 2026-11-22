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
/** Папка автора влога (`slug` из `VLOG_AUTHORS`): строчная латиница и цифры. */
export const VLOG_FOLDER = /^[a-z0-9]{2,20}$/
/** Папка обложек рядом с папками авторов: `korean_vlog/covers/<номер видео>.jpg`. */
export const VLOG_COVERS = 'covers'

/**
 * GET /api/video/lesson-01.mp4: видео лежат на Яндекс.Диске (папка korean_video в корне), отсюда браузер уходит на временную ссылку Диска
 * (перемотка работает, трафик идёт мимо сервера). Открыто всем, как и прежняя раздача видео (решение владельца: видео не закрыты токеном).
 * Включается правкой Caddy (docs/hosting.md): /video/* → /api/video/*.
 *
 * Видео влогов (чужие ролики, скачанные владельцем) наружу не открыты: `GET /api/video/vlog/<автор>/<имя>/url` (с токеном) отдаёт подписанную ссылку
 * на 6 часов, `GET /api/video/vlog/<автор>/<имя>/file?e&s` проверяет подпись и уводит на Диск (`korean_vlog/<автор>/<имя>.mp4`) или отдаёт файл из `data/vlog/<автор>/` (перемотка работает).
 *
 * Обложки влогов: `GET /api/video/vlog-cover/<номер видео>` (открыто, это общедоступные обложки ютуба) уводит на Диск (`korean_vlog/covers/<номер>.jpg`) или отдаёт
 * файл из `data/vlog/covers/`; нет файла: 404, и сайт берёт обложку с ютуба, а если не вышло, показывает плашку (в сети планшета ютуб может не открываться).
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

  /** Обложка влога (картинка 320×180): с Диска или из `data/vlog/covers/`; 404, если файла нет. */
  @Public()
  @Get('vlog-cover/:name')
  async vlogCover(@Param('name') name: string, @Res() res: Response) {
    if (!VLOG_NAME.test(name)) throw new NotFoundException({ error: 'not found' })
    if (this.disk.configured()) {
      let href: string
      try {
        href = await this.disk.cachedLink(`${DISK_DIRS.vlog}/${VLOG_COVERS}/${name}.jpg`)
      } catch {
        throw new NotFoundException({ error: 'not found' })
      }
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return void res.redirect(302, href)
    }
    const file = path.join(VLOG_DIR, VLOG_COVERS, `${name}.jpg`)
    if (!existsSync(file)) throw new NotFoundException({ error: 'not found' })
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.sendFile(file)
  }

  /** Подписанная ссылка на видео влога; 404, если файла нет. */
  @Get('vlog/:folder/:name/url')
  async vlogUrl(@Param('folder') folder: string, @Param('name') name: string) {
    if (!VLOG_FOLDER.test(folder) || !VLOG_NAME.test(name) || !(await this.vlogExists(folder, name))) throw new NotFoundException({ error: 'not found' })
    return { url: signPath(`/api/video/vlog/${folder}/${name}/file`, TOKEN) }
  }

  @Public()
  @Get('vlog/:folder/:name/file')
  async vlogFile(@Param('folder') folder: string, @Param('name') name: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    if (!VLOG_FOLDER.test(folder) || !VLOG_NAME.test(name) || !verifySigned(`/api/video/vlog/${folder}/${name}/file`, e, s, TOKEN)) return void res.status(403).json({ error: 'forbidden' })
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (this.disk.configured()) {
      try {
        return void res.redirect(302, await this.disk.cachedLink(`${DISK_DIRS.vlog}/${folder}/${name}.mp4`))
      } catch {
        throw new NotFoundException({ error: 'not found' })
      }
    }
    const file = path.join(VLOG_DIR, folder, `${name}.mp4`)
    if (!existsSync(file)) throw new NotFoundException({ error: 'not found' })
    // sendFile сам отвечает на запросы «с такого-то байта» (перемотка)
    res.sendFile(file, { acceptRanges: true })
  }

  private async vlogExists(folder: string, name: string): Promise<boolean> {
    if (this.disk.configured()) return this.disk.exists(`${DISK_DIRS.vlog}/${folder}/${name}.mp4`).catch(() => false)
    return existsSync(path.join(VLOG_DIR, folder, `${name}.mp4`))
  }
}
