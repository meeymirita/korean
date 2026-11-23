import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { BadRequestException, Controller, Get, HttpCode, Logger, NotFoundException, Optional, ServiceUnavailableException, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { Response } from 'express'
import { Owner, Public } from '../auth/auth.js'
import { DATA_DIR, TOKEN } from '../config.js'
import { signPath, verifySigned } from '../music/music.util.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'
import { CacheService } from '../cache/cache.service.js'
import { cacheDrop, cacheFill, cacheGet } from './manhwa.cache.js'

/** Папка манхвы на сервере, если Яндекс.Диск не подключён (локальная проверка): `data/manhwa/<манхва>/<глава>/<NNN>.<расширение>` и `data/manhwa/<манхва>/index.json`. */
export const MANHWA_DIR = path.join(DATA_DIR, 'manhwa')
/** Папка манхвы: латиница, цифры и «-» (попадает в адрес). */
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/
const CHAPTER = /^\d{1,3}$/
const FILE = /^(\d{3}\.(webp|jpe?g|png)|cover\.jpg)$/
/** Своя обложка манхвы: `cover-<метка>.<jpg|png|webp>` в папке манхвы (метка новая при каждой замене, чтобы браузер не держал старую). */
const OWN_COVER = /^cover-[a-z0-9]{1,12}\.(jpg|png|webp)$/
const MAX_COVER = 8 * 1024 * 1024
const DAY = 24 * 3600_000

/** Диск отвечает 423 («ресурс заблокирован»), 429 и 5xx, пока над папкой идёт другая операция (например, загрузка папки манхвы в браузере): пробуем ещё раз через паузу. */
async function retryDisk<T>(fn: () => Promise<T>): Promise<T> {
  for (let k = 1; ; k++) {
    try {
      return await fn()
    } catch (e) {
      const busy = e instanceof Error && /yadisk (upload )?(423|429|5\d\d)\b|fetch failed|timeout|aborted/i.test(e.message)
      if (!busy || k >= 5) throw e
      await new Promise(r => setTimeout(r, 1500 * k))
    }
  }
}

/** Не больше 6 запросов ссылок к Диску одновременно: список глав просит сразу десятки обложек, и Диск часть из них отклоняет. */
let active = 0
const waiting: (() => void)[] = []
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  while (active >= 6) await new Promise<void>(r => waiting.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    waiting.shift()?.()
  }
}

interface Index {
  title?: string
  /** имя файла своей обложки в папке манхвы */
  cover?: string
  chapters: { n: number; cv?: string; pages: { f: string; w: number; h: number }[] }[]
}

/**
 * Манхва: на Яндекс.Диске папка `korean_manhwa`, в ней по папке на каждую манхву (`korean_manhwa/<манхва>/`: `index.json` со списком страниц и размерами и папки глав
 * `<глава>/<NNN>.webp`; всё это раскладывает `scripts/manhwa-import.mjs`, заливает `scripts/manhwa-upload.mjs`).
 * `GET /api/manhwa` (только владелец) отдаёт полку: все манхвы с названием, номерами глав и обложкой; `GET /api/manhwa/<манхва>` отдаёт главы со страницами.
 * Ссылки на страницы подписаны (`<img>` не умеет слать токен), `GET /api/manhwa/<манхва>/<глава>/<файл>?e&s` проверяет подпись и уводит на временную ссылку Диска
 * (или отдаёт файл из `data/manhwa/`). Подпись держится двое суток и не меняется в течение дня, чтобы браузер кэшировал картинки.
 */
@Controller('manhwa')
export class ManhwaController {
  /** Кэш: Redis для кэша или память (тесты создают контроллер без второго параметра). */
  constructor(private readonly disk: YaDiskService, @Optional() private readonly cacheSvc: CacheService = new CacheService()) {}
  private readonly log = new Logger('Manhwa')

  /** Временная ссылка Диска на файл: очередь, повторы при занятости Диска, причина сбоя в журнал. */
  private diskLink(remote: string) {
    return limited(() => retryDisk(() => this.disk.cachedLink(remote))).catch((e: unknown) => {
      this.log.warn(`нет ссылки на ${remote}: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    })
  }

  /** index.json манхвы: 5 минут в общем кэше (после загрузки обложки обновляется сразу). */
  private readIndex(slug: string): Promise<Index> {
    return this.cacheSvc.wrap(`manhwa:index:${slug}`, 300, async () => {
      if (this.disk.configured()) {
        const res = await fetch(await this.disk.link(`${DISK_DIRS.manhwa}/${slug}/index.json`), { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) throw new Error(`index ${res.status}`)
        return (await res.json()) as Index
      }
      return JSON.parse(readFileSync(path.join(MANHWA_DIR, slug, 'index.json'), 'utf8')) as Index
    })
  }

  /** Список манхв (папки в korean_manhwa): минута в кэше, новая манхва появляется на полке не позже чем через минуту. */
  private slugs(): Promise<string[]> {
    return this.cacheSvc.wrap('manhwa:slugs', 60, async () => {
      const names = this.disk.configured()
        ? (await this.disk.list(DISK_DIRS.manhwa)).filter(i => i.type === 'dir').map(i => i.name)
        : existsSync(MANHWA_DIR)
          ? readdirSync(MANHWA_DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
          : []
      return names.filter(n => SLUG.test(n)).sort()
    })
  }

  private sign(slug: string, n: number, f: string) {
    const day = Math.floor(Date.now() / DAY) * DAY
    return signPath(`/api/manhwa/${slug}/${n}/${f}`, TOKEN, day, 2 * DAY)
  }

  private signRoot(slug: string, f: string) {
    const day = Math.floor(Date.now() / DAY) * DAY
    return signPath(`/api/manhwa/${slug}/${f}`, TOKEN, day, 2 * DAY)
  }

  /**
   * Файл с Диска: из кэша на сервере; нет в кэше, значит скачиваем с Диска и оставляем (обложки и страницы читаются у нас, лимиты Диска не мешают);
   * не вышло скачать (большой файл, сбой), тогда перенаправление на временную ссылку Диска.
   */
  private async fromDisk(key: string, res: Response) {
    const cached = cacheGet(key) ?? (await cacheFill(key, () => this.diskLink(`${DISK_DIRS.manhwa}/${key}`)))
    if (cached) return void res.sendFile(cached)
    try {
      return void res.redirect(302, await this.diskLink(`${DISK_DIRS.manhwa}/${key}`))
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
  }

  /** Полка: все манхвы (без списка страниц). */
  @Owner()
  @Get()
  async shelf() {
    const books: { slug: string; title: string; chapters: number[]; cover: string | null; ownCover: boolean }[] = []
    for (const slug of await this.slugs().catch(() => [])) {
      try {
        const idx = await this.readIndex(slug)
        const c = idx.chapters[1] ?? idx.chapters[0]
        const f = c ? (c.cv ?? (c.pages[1] ?? c.pages[0])?.f) : undefined
        const own = idx.cover && OWN_COVER.test(idx.cover) ? this.signRoot(slug, idx.cover) : null
        books.push({ slug, title: idx.title ?? slug, chapters: idx.chapters.map(x => x.n), cover: own ?? (c && f ? this.sign(slug, c.n, f) : null), ownCover: !!own })
      } catch {
        /* папка без index.json: пропускаем */
      }
    }
    return { books }
  }

  /** Главы одной манхвы со страницами. */
  @Owner()
  @Get(':slug')
  async book(@Param('slug') slug: string) {
    if (!SLUG.test(slug)) throw new NotFoundException({ error: 'not found' })
    let idx: Index
    try {
      idx = await this.readIndex(slug)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
    return {
      title: idx.title ?? slug,
      chapters: idx.chapters.map(c => ({ n: c.n, ...(c.cv ? { cv: this.sign(slug, c.n, c.cv) } : {}), pages: c.pages.map(p => ({ u: this.sign(slug, c.n, p.f), w: p.w, h: p.h })) })),
    }
  }

  /** Своя обложка манхвы: multipart, поле file (jpg, png или webp до 8 МБ). Кладётся на Диск рядом с главами, имя пишется в index.json; прежняя обложка удаляется. */
  @Owner()
  @Post(':slug/cover')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_COVER, files: 1, fields: 2, parts: 3, headerPairs: 30 } }))
  async setCover(@Param('slug') slug: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!SLUG.test(slug)) throw new NotFoundException({ error: 'not found' })
    if (!file) throw new BadRequestException({ error: 'нужен файл' })
    const b = file.buffer
    const ext = b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? 'jpg'
      : b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
        ? 'png'
        : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : ''
    if (!ext) throw new BadRequestException({ error: 'нужна картинка jpg, png или webp' })
    let idx: Index
    try {
      idx = await this.readIndex(slug)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
    const name = `cover-${Date.now().toString(36)}.${ext}`
    const old = idx.cover
    const next: Index = { ...idx, cover: name }
    const json = Buffer.from(JSON.stringify(next))
    if (this.disk.configured()) {
      try {
        await retryDisk(() => this.disk.put(`${DISK_DIRS.manhwa}/${slug}/${name}`, b))
        await retryDisk(() => this.disk.put(`${DISK_DIRS.manhwa}/${slug}/index.json`, json))
      } catch {
        throw new ServiceUnavailableException({ error: 'Диск сейчас занят другой операцией (например, идёт загрузка папки): попробуй через минуту' })
      }
      if (old && OWN_COVER.test(old)) {
        const p = `${DISK_DIRS.manhwa}/${slug}/${old}`
        this.disk.forgetLink(p)
        cacheDrop(`${slug}/${old}`)
        await retryDisk(() => this.disk.remove(p)).catch(() => undefined)
      }
    } else {
      const dir = path.join(MANHWA_DIR, slug)
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, name), b)
      writeFileSync(path.join(dir, 'index.json'), json)
      if (old && OWN_COVER.test(old)) rmSync(path.join(dir, old), { force: true })
    }
    await this.cacheSvc.set(`manhwa:index:${slug}`, next, 300)
    return { cover: this.signRoot(slug, name) }
  }

  /** Своя обложка манхвы (подписанная ссылка, как у страниц). */
  @Public()
  @Get(':slug/:file')
  async coverFile(@Param('slug') slug: string, @Param('file') file: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    if (!SLUG.test(slug) || !OWN_COVER.test(file)) throw new NotFoundException({ error: 'not found' })
    if (!verifySigned(`/api/manhwa/${slug}/${file}`, e, s, TOKEN)) return void res.status(403).json({ error: 'forbidden' })
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (this.disk.configured()) return this.fromDisk(`${slug}/${file}`, res)
    const f = path.join(MANHWA_DIR, slug, file)
    if (!existsSync(f)) throw new NotFoundException({ error: 'not found' })
    res.sendFile(f)
  }

  @Public()
  @Get(':slug/:n/:file')
  async page(@Param('slug') slug: string, @Param('n') n: string, @Param('file') file: string, @Query('e') e: string, @Query('s') s: string, @Res() res: Response) {
    if (!SLUG.test(slug) || !CHAPTER.test(n) || !FILE.test(file)) throw new NotFoundException({ error: 'not found' })
    if (!verifySigned(`/api/manhwa/${slug}/${n}/${file}`, e, s, TOKEN)) return void res.status(403).json({ error: 'forbidden' })
    res.setHeader('Cache-Control', 'private, max-age=86400')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (this.disk.configured()) return this.fromDisk(`${slug}/${n}/${file}`, res)
    const f = path.join(MANHWA_DIR, slug, n, file)
    if (!existsSync(f)) throw new NotFoundException({ error: 'not found' })
    res.sendFile(f)
  }
}
