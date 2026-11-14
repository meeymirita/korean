/** Музыкальный плеер владельца: список песен в базе, файлы на Яндекс.Диске (без Диска в data/music), загрузка с компьютера и скачивание по ссылке через yt-dlp. */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { copyFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, MAX_TRACK, MAX_TRACK_MB, MUSIC_DIR, MUSIC_TMP, TOKEN } from '../config.js'
import { Db } from '../db/db.service.js'
import { logError } from '../log.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'
import { PLAYABLE_EXT, cleanCategory, cleanTitle, cleanUrl, downloadArgs, extOf, fixUploadName, infoArgs, parseProgress, signPath, titleFromName, ytdlpError } from './music.util.js'

export type JobStage = 'info' | 'download' | 'convert' | 'save' | 'done' | 'error'

export interface Job {
  id: string
  /** upload: файл с компьютера, url: скачивание по ссылке */
  kind: 'upload' | 'url'
  stage: JobStage
  /** 0–100: процент скачивания (для загрузки с компьютера и сохранения: 0 или 100) */
  percent: number
  title: string
  error?: string
  /** id готовой песни */
  trackId?: string
  started: number
}

/** Запись о песне для сайта: ссылка на обложку подписана (её открывает `<img>`, а он не умеет слать токен). */
export interface TrackOut {
  id: string
  title: string
  duration: number
  size: number
  created: number
  source: string
  /** вкладка плеера: quiet или nightcore */
  category: string
  cover: string | null
}

const STAGE_TEXT: Record<JobStage, string> = { info: 'Узнаю название', download: 'Скачиваю', convert: 'Перевожу в m4a', save: 'Сохраняю на Диск', done: 'Готово', error: 'Ошибка' }
export const stageText = (s: JobStage) => STAGE_TEXT[s]

const newId = () => randomBytes(8).toString('hex')
/** Готовые и неудавшиеся задания остаются в списке десять минут, чтобы сайт успел показать итог. */
const JOB_KEEP_MS = 10 * 60_000
/** Скачивание по ссылке дольше двух часов считаем зависшим. */
const YTDLP_TIMEOUT_MS = 2 * 3600_000

type Resolved = { kind: 'url'; href: string } | { kind: 'file'; path: string }

@Injectable()
export class MusicService {
  private jobs = new Map<string, Job>()
  private ytdlpBusy = false

  constructor(private readonly db: Db, private readonly disk: YaDiskService) {
    // что осталось от прерванных загрузок (перезапуск сервера посреди скачивания)
    try {
      rmSync(MUSIC_TMP, { recursive: true, force: true })
    } catch {
      /* папки нет */
    }
  }

  /* ---------- хранилище: Диск или локальная папка ---------- */
  private get useDisk() {
    return this.disk.configured()
  }

  private async put(name: string, file: string) {
    if (this.useDisk) return this.disk.upload(`${DISK_DIRS.music}/${name}`, file)
    mkdirSync(MUSIC_DIR, { recursive: true })
    await copyFile(file, path.join(MUSIC_DIR, name))
  }

  private async resolve(name: string): Promise<Resolved> {
    if (this.useDisk) {
      const href = await this.disk.cachedLink(`${DISK_DIRS.music}/${name}`)
      return /^https?:/.test(href) ? { kind: 'url', href } : { kind: 'file', path: href } // с YADISK_DUMP_DIR (тесты) это путь к файлу
    }
    const p = path.join(MUSIC_DIR, name)
    if (!existsSync(p)) throw new NotFoundException({ error: 'not found' })
    return { kind: 'file', path: p }
  }

  private async drop(name: string) {
    if (!name) return
    if (this.useDisk) {
      this.disk.forgetLink(`${DISK_DIRS.music}/${name}`)
      await this.disk.remove(`${DISK_DIRS.music}/${name}`, false).catch(e => logError('Музыка: не удалился с Диска', name, (e as Error).message))
    } else await rm(path.join(MUSIC_DIR, name), { force: true })
  }

  /* ---------- список ---------- */
  private out(r: { id: string; title: string; cover: string; duration: number; size: bigint; created: bigint; source: string; category: string }): TrackOut {
    return {
      id: r.id,
      title: r.title,
      duration: r.duration,
      size: Number(r.size),
      created: Number(r.created),
      source: r.source === 'upload' ? 'upload' : 'url',
      category: r.category === 'nightcore' ? 'nightcore' : 'quiet',
      cover: r.cover ? signPath(`/api/music/${r.id}/cover`, TOKEN) : null,
    }
  }

  async list() {
    this.pruneJobs()
    const rows = await (await this.db.orm()).track.findMany({ orderBy: { created: 'asc' } })
    return { tracks: rows.map(r => this.out(r)), jobs: [...this.jobs.values()].map(j => ({ ...j, text: stageText(j.stage) })) }
  }

  /** Подписанная ссылка на файл песни для `<audio>`. */
  async streamUrl(id: string) {
    const row = await (await this.db.orm()).track.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    return { url: signPath(`/api/music/${id}/stream`, TOKEN) }
  }

  /** Куда отправить браузер за файлом песни или обложки (после проверки подписи в контроллере). */
  async locate(id: string, what: 'stream' | 'cover'): Promise<Resolved & { name: string }> {
    const row = await (await this.db.orm()).track.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    const name = what === 'stream' ? row.file : row.cover
    if (!name) throw new NotFoundException({ error: 'not found' })
    return { ...(await this.resolve(name)), name }
  }

  /** Меняет название и/или вкладку песни; чего нет в запросе, остаётся как было. */
  async update(id: string, body: { title?: unknown; category?: unknown }) {
    const data: { title?: string; category?: string } = {}
    if (body.title !== undefined) {
      const t = cleanTitle(body.title)
      if (!t) throw new BadRequestException({ error: 'invalid title' })
      data.title = t
    }
    if (body.category !== undefined) {
      const c = cleanCategory(body.category)
      if (!c) throw new BadRequestException({ error: 'invalid category' })
      data.category = c
    }
    if (!Object.keys(data).length) throw new BadRequestException({ error: 'nothing to change' })
    try {
      const r = await (await this.db.orm()).track.update({ where: { id }, data })
      return this.out(r)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
  }

  async remove(id: string) {
    const db = await this.db.orm()
    const row = await db.track.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    await db.track.delete({ where: { id } })
    await this.drop(row.file)
    await this.drop(row.cover)
    return { ok: true }
  }

  /* ---------- задания ---------- */
  private pruneJobs() {
    const now = Date.now()
    for (const [id, j] of this.jobs) if ((j.stage === 'done' || j.stage === 'error') && now - j.started > JOB_KEEP_MS) this.jobs.delete(id)
  }

  private newJob(kind: Job['kind'], title: string): Job {
    this.pruneJobs()
    const job: Job = { id: newId(), kind, stage: kind === 'url' ? 'info' : 'save', percent: 0, title, started: Date.now() }
    this.jobs.set(job.id, job)
    return job
  }

  private fail(job: Job, message: string) {
    job.stage = 'error'
    job.error = message
    logError('Музыка: задание не удалось', job.title, message)
  }

  /** Файл с компьютера уже лежит во временной папке: определяем длительность и обложку, отправляем на хранение, записываем в список. */
  startUpload(file: { path: string; originalname: string; size: number } | undefined, title: unknown, category: unknown) {
    if (!file) throw new BadRequestException({ error: 'no file' })
    const cat = cleanCategory(category)
    if (!cat) throw new BadRequestException({ error: 'invalid category' })
    const ext = extOf(file.originalname)
    const job = this.newJob('upload', cleanTitle(title) ?? titleFromName(fixUploadName(file.originalname)))
    void this.finish(job, file.path, ext, null, 'upload', cat, file.size).catch(e => this.fail(job, (e as Error).message))
    return { job: job.id }
  }

  /** Скачивание по ссылке через yt-dlp: по одному заданию за раз (ноутбук владельца и сервер небольшие). */
  startUrl(url: unknown, category: unknown) {
    const u = cleanUrl(url)
    if (!u) throw new BadRequestException({ error: 'invalid url' })
    const cat = cleanCategory(category)
    if (!cat) throw new BadRequestException({ error: 'invalid category' })
    if (this.ytdlpBusy) throw new ConflictException({ error: 'busy' })
    this.ytdlpBusy = true
    const job = this.newJob('url', u)
    void this.runYtdlp(job, u, cat)
      .catch(e => this.fail(job, (e as Error).message))
      .finally(() => (this.ytdlpBusy = false))
    return { job: job.id }
  }

  private run(cmd: string, args: string[], onLine?: (line: string) => void) {
    return new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      let buf = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), YTDLP_TIMEOUT_MS)
      child.stdout.on('data', d => {
        const s = String(d)
        if (onLine) {
          buf += s
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          lines.forEach(onLine)
        } else if (out.length < 40_000_000) out += s // название и форматы видео (у некоторых роликов JSON в несколько мегабайт)
      })
      child.stderr.on('data', d => (err = (err + String(d)).slice(-4000)))
      child.once('error', e => (clearTimeout(timer), reject(e)))
      child.once('close', code => (clearTimeout(timer), resolve({ code: code ?? 1, out, err })))
    })
  }

  private async runYtdlp(job: Job, url: string, category: string) {
    const bin = process.env.YTDLP_BIN || 'yt-dlp'
    // файл cookies YouTube (необязательно): лежит в папке данных рядом с базой, docs/music.md
    const cookiesFile = process.env.YTDLP_COOKIES || path.join(DATA_DIR, 'youtube-cookies.txt')
    const cookies = existsSync(cookiesFile) ? cookiesFile : undefined
    const dir = path.join(MUSIC_TMP, job.id)
    mkdirSync(dir, { recursive: true })
    try {
      let info: { title?: string; duration?: number }
      try {
        const r = await this.run(bin, infoArgs(url, { cookies }))
        if (r.code !== 0) return this.fail(job, ytdlpError(r.err))
        info = JSON.parse(r.out) as { title?: string; duration?: number }
      } catch (e) {
        const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'На сервере не установлен yt-dlp' : (e as Error).message
        return this.fail(job, msg)
      }
      job.title = cleanTitle(info.title) ?? job.title
      job.stage = 'download'
      const r = await this.run(bin, downloadArgs(url, { outDir: dir, cookies }), line => {
        const p = parseProgress(line)
        if (p !== null) job.percent = p
      })
      if (r.code !== 0) return this.fail(job, ytdlpError(r.err))
      const files = readdirSync(dir)
      const audio = files.find(f => f.startsWith('src.') && !/\.(jpg|jpeg|png|webp|part|ytdl)$/i.test(f))
      if (!audio) return this.fail(job, 'yt-dlp не оставил звуковой файл')
      const cover = files.find(f => /^src\.jpe?g$/i.test(f))
      let ext = extOf(audio)
      let file = path.join(dir, audio)
      if (!PLAYABLE_EXT.has(ext)) {
        job.stage = 'convert'
        const out = path.join(dir, 'converted.m4a')
        const c = await this.run('ffmpeg', ['-y', '-i', file, '-vn', '-c:a', 'aac', '-b:a', '160k', out])
        if (c.code !== 0) return this.fail(job, 'Не получилось перевести звук в m4a')
        file = out
        ext = 'm4a'
      }
      await this.finish(job, file, ext, cover ? path.join(dir, cover) : null, 'url', category, undefined, typeof info.duration === 'number' ? Math.round(info.duration) : 0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  /** Общий конец обоих путей: длительность, обложка, сохранение в хранилище и запись в список. */
  private async finish(job: Job, file: string, ext: string, cover: string | null, source: string, category: string, size?: number, knownDuration = 0) {
    try {
      job.stage = 'save'
      if (!existsSync(file)) return this.fail(job, 'Файл пропал')
      const bytes = size ?? statSync(file).size
      if (bytes > MAX_TRACK) return this.fail(job, `Файл больше ${MAX_TRACK_MB} МБ`)
      const id = newId()
      const duration = knownDuration || (await this.probe(file))
      let coverFile = ''
      if (!cover && source === 'upload') cover = await this.embeddedCover(file)
      if (cover && existsSync(cover)) {
        coverFile = `${id}.jpg`
        await this.put(coverFile, cover)
      }
      const name = `${id}.${ext}`
      await this.put(name, file)
      await (await this.db.orm()).track.create({ data: { id, title: job.title, file: name, cover: coverFile, duration, size: BigInt(bytes), source: source === 'upload' ? 'upload' : 'url', category, created: BigInt(Date.now()) } })
      job.trackId = id
      job.percent = 100
      job.stage = 'done'
    } finally {
      // загруженный файл лежит во временной папке multer: убираем (папку задания по ссылке убирает runYtdlp)
      if (job.kind === 'upload') await Promise.all([rm(file, { force: true }), rm(`${file}.cover.jpg`, { force: true })])
    }
  }

  private async probe(file: string): Promise<number> {
    try {
      const r = await this.run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file])
      const n = Math.round(Number(r.out.trim()))
      return r.code === 0 && Number.isFinite(n) && n > 0 ? n : 0
    } catch {
      return 0 // ffprobe не установлен: длительность покажет сам проигрыватель
    }
  }

  /** Обложка из тегов mp3/m4a (если есть); без ffmpeg или без картинки в файле: null. */
  private async embeddedCover(file: string): Promise<string | null> {
    const out = `${file}.cover.jpg`
    try {
      const r = await this.run('ffmpeg', ['-y', '-i', file, '-an', '-frames:v', '1', '-vf', 'scale=480:-2', out])
      return r.code === 0 && existsSync(out) && statSync(out).size > 0 ? out : null
    } catch {
      return null
    }
  }
}
