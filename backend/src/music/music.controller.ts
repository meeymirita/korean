import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { diskStorage } from 'multer'
import { Owner, Public } from '../auth/auth.js'
import { MAX_TRACK, MUSIC_TMP, TOKEN } from '../config.js'
import { MusicService } from './music.service.js'
import { UPLOAD_EXT, extOf, verifySigned } from './music.util.js'

/**
 * /api/music: музыкальный плеер, только владелец. Файлы играют через подписанные ссылки (`<audio>` и `<img>` не умеют слать токен):
 * GET /api/music/:id/stream и /cover проверяют подпись и перенаправляют на временную ссылку Диска (или отдают файл с сервера, если Диска нет).
 */
/** Папка для временных файлов загрузки: создаётся при первой загрузке. */
const musicTmp = () => {
  mkdirSync(MUSIC_TMP, { recursive: true })
  return MUSIC_TMP
}

@Owner()
@Controller('music')
export class MusicController {
  constructor(private readonly music: MusicService) {}

  /** Песни и текущие задания (сайт спрашивает раз в секунду, пока есть неоконченные). */
  @Get()
  list() {
    return this.music.list()
  }

  @Get(':id/url')
  url(@Param('id') id: string) {
    return this.music.streamUrl(id)
  }

  /** Файл с компьютера: multipart, поле file (до 350 МБ), необязательные поля title и category (quiet или nightcore, по умолчанию quiet). Ответ сразу после получения файла, дальше идёт задание. */
  @Post('upload')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, musicTmp()),
        filename: (_req, file, cb) => cb(null, `${randomBytes(8).toString('hex')}.${extOf(file.originalname) || 'bin'}`),
      }),
      fileFilter: (_req, file, cb) => cb(null, UPLOAD_EXT.has(extOf(file.originalname))),
      limits: { fileSize: MAX_TRACK, files: 1, fields: 4, fieldSize: 1024, parts: 5, headerPairs: 30 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: { title?: unknown; category?: unknown }) {
    return this.music.startUpload(file, body?.title, body?.category)
  }

  /** Скачать по ссылке (yt-dlp): `{ url, category? }`. Ответ сразу, ход виден в GET /api/music (jobs). */
  @Post('url')
  @HttpCode(202)
  addUrl(@Body() body: { url?: unknown; category?: unknown }) {
    return this.music.startUrl(body?.url, body?.category)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { title?: unknown; category?: unknown }) {
    return this.music.update(id, body ?? {})
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.music.remove(id)
  }

  @Public()
  @Get(':id/stream')
  stream(@Param('id') id: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    return this.serve(id, 'stream', e, s, res)
  }

  @Public()
  @Get(':id/cover')
  cover(@Param('id') id: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    return this.serve(id, 'cover', e, s, res)
  }

  private async serve(id: string, what: 'stream' | 'cover', e: string, s: string, res: Response) {
    if (!/^[a-f0-9]{16}$/.test(id) || !verifySigned(`/api/music/${id}/${what}`, e, s, TOKEN)) return void res.status(403).json({ error: 'forbidden' })
    const target = await this.music.locate(id, what)
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (target.kind === 'url') return void res.redirect(302, target.href)
    // sendFile сам отвечает на запросы «с такого-то байта» (перемотка)
    res.sendFile(target.path, { acceptRanges: true })
  }
}
