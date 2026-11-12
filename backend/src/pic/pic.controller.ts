import { BadRequestException, Controller, Delete, Get, Header, NotFoundException, Param, PayloadTooLargeException, Post, Query, Res, ServiceUnavailableException, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { memoryStorage } from 'multer'
import sharp from 'sharp'
import { Owner, Public } from '../auth/auth.js'
import { MAX_SITE_IMAGE } from '../config.js'
import { sniff } from '../images/images.service.js'
import { logError } from '../log.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'

/** Картинки карточек грамматики: lesson-3.webp (урок части 1) и own-hago.webp (своя карточка по id). */
const KEY = /^(lesson-\d{1,2}|own-[a-z0-9_]+)$/
const NAME = /^(lesson-\d{1,2}|own-[a-z0-9_]+)\.webp$/
/** ширина картинки карточки после загрузки */
const WIDTH = 1280
/** сколько сервер помнит список файлов папки */
const LIST_TTL = 60_000

/**
 * /api/pic/grammar: картинки карточек грамматики лежат на Яндекс.Диске в папке korean_grammar.
 * Смотреть может любой (как и саму грамматику), загружать и удалять только владелец: файл сразу ложится на Диск.
 */
@Controller('pic')
export class PicController {
  constructor(private readonly disk: YaDiskService) {}

  private cache: { keys: string[]; at: number } | null = null

  private remote = (key: string) => `${DISK_DIRS.grammar}/${key}.webp`

  private async keys(fresh = false): Promise<string[]> {
    if (!fresh && this.cache && Date.now() - this.cache.at < LIST_TTL) return this.cache.keys
    const items = await this.disk.list(DISK_DIRS.grammar)
    const keys = items.filter(i => i.type === 'file' && NAME.test(i.name)).map(i => i.name.slice(0, -'.webp'.length)).sort()
    this.cache = { keys, at: Date.now() }
    return keys
  }

  private check(key: string) {
    if (!KEY.test(key)) throw new BadRequestException({ error: 'bad key' })
    if (!this.disk.configured()) throw new ServiceUnavailableException({ error: 'no disk' })
  }

  /** GET /api/pic/grammar: у каких карточек есть картинка (имена файлов папки без расширения). */
  @Public()
  @Get('grammar')
  @Header('Cache-Control', 'no-cache')
  async list() {
    if (!this.disk.configured()) throw new NotFoundException({ error: 'not found' })
    try {
      return { keys: await this.keys() }
    } catch (e) {
      logError('pic', e)
      throw new ServiceUnavailableException({ error: 'disk' })
    }
  }

  /** GET /api/pic/grammar/own-hago.webp: браузер уходит на временную ссылку Диска. */
  @Public()
  @Get('grammar/:name')
  async grammar(@Param('name') name: string, @Query('fresh') fresh: string | undefined, @Res() res: Response) {
    if (!NAME.test(name) || !this.disk.configured()) throw new NotFoundException({ error: 'not found' })
    let href: string
    try {
      // ?fresh=…: картинка не загрузилась (файл на Диске заменили, ссылка из памяти ведёт на старый), сайт просит новую ссылку
      href = await this.disk.cachedLink(`${DISK_DIRS.grammar}/${name}`, !!fresh)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
    res.setHeader('Cache-Control', fresh ? 'no-store' : 'public, max-age=600')
    res.redirect(302, href)
  }

  /** POST /api/pic/grammar/own-hago/file: картинка карточки (новая или замена). Сжимается до ширины 1280, сохраняется как webp прямо на Диск. */
  @Owner()
  @Post('grammar/:key/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_SITE_IMAGE, files: 1, fields: 0, parts: 2 } }))
  async upload(@Param('key') key: string, @UploadedFile() file: Express.Multer.File | undefined) {
    this.check(key)
    if (!file) throw new BadRequestException({ error: 'no file' })
    if (file.size > MAX_SITE_IMAGE) throw new PayloadTooLargeException({ error: 'file too large' })
    if (!sniff(file.buffer)) throw new BadRequestException({ error: 'not an image' })
    let out: Buffer
    try {
      out = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 80_000_000 }).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    } catch {
      throw new BadRequestException({ error: 'bad image' })
    }
    try {
      await this.disk.put(this.remote(key), out)
    } catch (e) {
      logError('pic', e)
      throw new ServiceUnavailableException({ error: 'disk' })
    }
    this.disk.forgetLink(this.remote(key))
    return { keys: await this.after(key, true) }
  }

  /** DELETE /api/pic/grammar/own-hago: убирает картинку карточки (на Диске она уходит в корзину). */
  @Owner()
  @Delete('grammar/:key')
  async remove(@Param('key') key: string) {
    this.check(key)
    try {
      await this.disk.remove(this.remote(key), false)
    } catch (e) {
      logError('pic', e)
      throw new ServiceUnavailableException({ error: 'disk' })
    }
    this.disk.forgetLink(this.remote(key))
    return { keys: await this.after(key, false) }
  }

  /** Список после правки: Диск может ответить с опозданием, поэтому изменённое имя ставим сами. */
  private async after(key: string, has: boolean) {
    let keys: string[]
    try {
      keys = await this.keys(true)
    } catch {
      keys = this.cache?.keys ?? []
    }
    keys = has ? [...new Set([...keys, key])].sort() : keys.filter(k => k !== key)
    this.cache = { keys, at: Date.now() }
    return keys
  }
}
