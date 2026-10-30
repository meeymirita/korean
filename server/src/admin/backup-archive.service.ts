/**
 * Полный архив платформы по кнопке в кабинете (и раз в неделю сам): база + картинки + файлы календаря + настройки,
 * сжат (tar.gz) и зашифрован паролем BACKUP_PASSPHRASE (openssl, AES-256), потом уходит на Яндекс Диск (WebDAV) и на почту.
 * Переменные в server/.env: BACKUP_PASSPHRASE; YADISK_LOGIN, YADISK_PASSWORD (пароль приложения «Файлы WebDAV»), YADISK_DIR;
 * BACKUP_MAIL_TO (по умолчанию почта из двухфакторной защиты); YADISK_URL нужен только тестам.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { TwoFaService } from '../auth/twofa.service'
import { DATA_DIR, ROOT } from '../config'
import { Db } from '../db/db.service'
import { MailService } from '../mail/mail.service'

const OUT = path.join(DATA_DIR, 'export')
const FILE = path.join(DATA_DIR, 'backup-archive.json')
/** Одно письмо — не больше 18 МБ вложения (у Яндекса лимит около 30 МБ, а вложение растёт на треть при пересылке), частей не больше 5. */
const PART = 18 * 1024 * 1024
const MAX_PARTS = 5
const KEEP_LOCAL = 2
const KEEP_DISK = 8
const WEEK = 7 * 86_400_000
export const STEPS = ['Снимок базы', 'Сжатие файлов', 'Шифрование', 'Яндекс Диск', 'Почта'] as const

export interface Job {
  running: boolean
  /** индекс этапа из STEPS (-1 — не запущено) */
  step: number
  /** 0–100 внутри всего процесса */
  percent: number
  started: number
}

export interface ArchiveResult {
  ok: boolean
  time: number
  name: string
  sizeKb: number
  disk: 'ok' | 'off' | 'fail'
  mail: 'ok' | 'off' | 'fail' | 'big'
  parts: number
  message: string
}

const run = (cmd: string, args: string[], env: Record<string, string> = {}) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => (err += d))
    p.on('error', reject)
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd}: ${err.trim().slice(0, 200) || 'код ' + code}`))))
  })

function dirSize(dir: string): number {
  let n = 0
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      n += e.isDirectory() ? dirSize(p) : e.isFile() ? statSync(p).size : 0
    }
  } catch {
    /* папки может не быть */
  }
  return n
}

@Injectable()
export class BackupArchiveService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  job: Job = { running: false, step: -1, percent: 0, started: 0 }

  constructor(
    private readonly db: Db,
    private readonly mail: MailService,
    private readonly twofa: TwoFaService,
  ) {}

  /** Раз в неделю сам (после 4 утра по времени сервера), если есть пароль и куда отправлять. */
  onModuleInit() {
    if (process.env.BACKUP_AUTO === '0') return
    this.timer = setInterval(() => {
      const last = this.last()
      if (!this.problems().length && new Date().getHours() >= 4 && Date.now() - (last?.time ?? 0) > WEEK) void this.start()
    }, 3600_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  last(): ArchiveResult | null {
    try {
      return JSON.parse(readFileSync(FILE, 'utf8')) as ArchiveResult
    } catch {
      return null
    }
  }

  private diskOn() {
    return !!(process.env.YADISK_LOGIN && process.env.YADISK_PASSWORD)
  }
  private mailTo() {
    return process.env.BACKUP_MAIL_TO || this.twofa.email()
  }
  private mailOn() {
    return this.mail.configured() && !!this.mailTo()
  }

  /** Чего не хватает для запуска (пусто — можно запускать). */
  problems(): string[] {
    const p: string[] = []
    if (!process.env.BACKUP_PASSPHRASE) p.push('не задан пароль архива BACKUP_PASSPHRASE в server/.env')
    if (!this.diskOn() && !this.mailOn()) p.push('некуда отправлять: задайте YADISK_LOGIN и YADISK_PASSWORD или настройте почту')
    return p
  }

  /** Куда уйдёт архив: показывает кабинет до запуска. */
  targets() {
    return { disk: this.diskOn(), mail: this.mailOn(), passphrase: !!process.env.BACKUP_PASSPHRASE }
  }

  /** Запуск в фоне; false, если уже идёт. */
  start(): boolean {
    if (this.job.running) return false
    this.job = { running: true, step: 0, percent: 0, started: Date.now() }
    void this.build().then(
      r => this.finish(r),
      e => this.finish({ ok: false, time: Date.now(), name: '', sizeKb: 0, disk: 'off', mail: 'off', parts: 0, message: (e as Error).message.slice(0, 300) }),
    )
    return true
  }

  private finish(r: ArchiveResult) {
    try {
      writeFileSync(FILE, JSON.stringify(r))
    } catch {
      /* статус — удобство, не критично */
    }
    this.job = { running: false, step: -1, percent: r.ok ? 100 : 0, started: 0 }
  }

  private set(step: number, percent: number) {
    this.job.step = step
    this.job.percent = Math.round(percent)
  }

  private async build(): Promise<ArchiveResult> {
    const bad = this.problems()
    if (bad.length) throw new Error(bad[0]!)
    const pass = process.env.BACKUP_PASSPHRASE!
    mkdirSync(OUT, { recursive: true, mode: 0o700 })
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
    const name = `korean-${stamp}.tar.gz.enc`
    const stage = path.join(OUT, `${stamp}.tmp`)
    const tar = path.join(OUT, `${stamp}.tar.gz`)
    const enc = path.join(OUT, name)
    try {
      // 1. снимок базы (можно, пока сервер работает)
      this.set(0, 2)
      mkdirSync(stage, { recursive: true, mode: 0o700 })
      this.db.sql.exec(`VACUUM INTO '${path.join(stage, 'app.db').replace(/'/g, "''")}'`)
      if (existsSync(path.join(ROOT, '.env'))) writeFileSync(path.join(stage, 'server.env'), readFileSync(path.join(ROOT, '.env')), { mode: 0o600 })
      writeFileSync(path.join(stage, 'manifest.txt'), `дата: ${new Date().toISOString()}\nвосстановление: docs/backup.md\n`)

      // 2. сжатие: процент считаем по размеру готового файла относительно исходных данных
      this.set(1, 8)
      const dirs = ['uploads', 'docs', 'thumbs', 'public'].filter(d => existsSync(path.join(DATA_DIR, d)))
      const total = dirSize(stage) + dirs.reduce((n, d) => n + dirSize(path.join(DATA_DIR, d)), 0) || 1
      const poll = setInterval(() => {
        try {
          this.set(1, 8 + Math.min(1, statSync(tar).size / total) * 32)
        } catch {
          /* файла ещё нет */
        }
      }, 400)
      try {
        await run('tar', ['-czf', tar, '-C', stage, '.', ...dirs.flatMap(d => ['-C', DATA_DIR, d])])
      } finally {
        clearInterval(poll)
      }

      // 3. шифрование: пароль передаётся через окружение, а не в командной строке
      this.set(2, 42)
      await run('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', tar, '-out', enc, '-pass', 'env:BACKUP_PASSPHRASE'], { BACKUP_PASSPHRASE: pass })
      rmSync(tar, { force: true })
      const size = statSync(enc).size
      this.set(2, 55)

      // 4. Яндекс Диск
      let disk: ArchiveResult['disk'] = 'off'
      const notes: string[] = []
      if (this.diskOn()) {
        this.set(3, 56)
        try {
          await this.upload(enc, name, size)
          disk = 'ok'
        } catch (e) {
          disk = 'fail'
          notes.push('Диск: ' + (e as Error).message)
        }
      }

      // 5. почта: одно письмо или несколько частей
      let mail: ArchiveResult['mail'] = 'off'
      let parts = 0
      if (this.mailOn()) {
        this.set(4, 82)
        try {
          parts = await this.sendMail(enc, name, size, disk)
          mail = parts ? 'ok' : 'big'
        } catch (e) {
          mail = 'fail'
          notes.push('Почта: ' + (e as Error).message)
        }
      }

      this.prune()
      const sent = disk === 'ok' || mail === 'ok'
      return {
        ok: sent,
        time: Date.now(),
        name,
        sizeKb: Math.round(size / 1024),
        disk,
        mail,
        parts,
        message: sent ? notes.join('; ') : notes.join('; ') || 'архив собран, но никуда не отправлен',
      }
    } finally {
      rmSync(stage, { recursive: true, force: true })
      rmSync(tar, { force: true })
    }
  }

  /* ---------- Яндекс Диск (WebDAV) ---------- */
  private dav(p: string) {
    const base = (process.env.YADISK_URL || 'https://webdav.yandex.ru').replace(/\/$/, '')
    return base + '/' + p.split('/').map(encodeURIComponent).join('/')
  }
  private auth() {
    return 'Basic ' + Buffer.from(`${process.env.YADISK_LOGIN}:${process.env.YADISK_PASSWORD}`).toString('base64')
  }
  private folder() {
    return (process.env.YADISK_DIR || 'backup_korean').replace(/^\/+|\/+$/g, '')
  }

  private async upload(file: string, name: string, size: number) {
    const dir = this.folder()
    // папка: 201 — создана, 405 — уже есть
    const mk = await fetch(this.dav(dir), { method: 'MKCOL', headers: { Authorization: this.auth() }, signal: AbortSignal.timeout(30_000) })
    if (mk.status === 401) throw new Error('Яндекс не принял логин или пароль приложения')
    if (![201, 405, 301].includes(mk.status) && !mk.ok) throw new Error('не получилось создать папку на Диске (' + mk.status + ')')

    // тело — поток с диска, чтобы файл в сотни мегабайт не читать в память; ход отправки двигает полосу 56 → 80
    let sent = 0
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>
    const counted = stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, ctl) => {
          sent += chunk.length
          this.set(3, 56 + (sent / size) * 24)
          ctl.enqueue(chunk)
        },
      }),
    )
    const res = await fetch(this.dav(`${dir}/${name}`), {
      method: 'PUT',
      headers: { Authorization: this.auth(), 'Content-Length': String(size) },
      body: counted,
      // @ts-expect-error duplex нужен для потокового тела, в типах fetch его ещё нет
      duplex: 'half',
      signal: AbortSignal.timeout(30 * 60_000),
    })
    if (res.status === 401) throw new Error('Яндекс не принял логин или пароль приложения')
    if (res.status === 507) throw new Error('на Диске нет места')
    if (!res.ok) throw new Error(`Диск ответил ${res.status}${await this.reason(res)}`)
    await this.pruneDisk(dir).catch(() => undefined) // чистка старых не должна ронять успешную отправку
  }

  /** Проверка каналов без сборки архива: маленький файл на Диск и короткое письмо. Пароль архива не нужен. */
  async test() {
    const disk = this.diskOn() ? this.testDisk() : Promise.resolve('off')
    const mail = this.mailOn() ? this.testMail() : Promise.resolve('off')
    // каналы проверяются одновременно: зависший Диск не задерживает письмо
    const [d, m] = await Promise.all([disk, mail])
    const notes = [d, m].filter(x => x !== 'ok' && x !== 'off')
    const out = { disk: d === 'ok' || d === 'off' ? d : 'fail', mail: m === 'ok' || m === 'off' ? m : 'fail', message: '' }
    out.message = notes.join('; ') || (d === 'off' && m === 'off' ? 'некуда отправлять: задайте YADISK_LOGIN и YADISK_PASSWORD или настройте почту' : '')
    if (notes.length) console.error('проверка отправки копий:', out.message)
    return out
  }

  /** Пояснение, которое Яндекс присылает в теле ответа (без тегов), для сообщения об ошибке. */
  private async reason(res: Response) {
    try {
      const t = (await res.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      return t ? `: ${t}` : ''
    } catch {
      return ''
    }
  }

  /** 'ok' или текст ошибки. */
  private async testDisk() {
    try {
      const dir = this.folder()
      const body = `Проверка отправки ${new Date().toISOString()}. Файл можно удалить.\n`
      const mk = await fetch(this.dav(dir), { method: 'MKCOL', headers: { Authorization: this.auth() }, signal: AbortSignal.timeout(20_000) })
      if (mk.status === 401) return 'Диск: Яндекс не принял логин или пароль приложения'
      const res = await fetch(this.dav(`${dir}/проверка.txt`), { method: 'PUT', headers: { Authorization: this.auth() }, body, signal: AbortSignal.timeout(20_000) })
      if (res.status === 401) return 'Диск: Яндекс не принял логин или пароль приложения'
      if (!res.ok) return `Диск ответил ${res.status}${await this.reason(res)}`
      return 'ok'
    } catch (e) {
      const err = e as Error
      return 'Диск: ' + (err.name === 'TimeoutError' ? 'нет ответа от webdav.yandex.ru за 20 секунд' : err.message.slice(0, 120))
    }
  }

  private async testMail() {
    try {
      await this.mail.send(this.mailTo(), '우리말: проверка отправки', 'Это проверочное письмо из «Настроек». Если оно пришло, почта для копий настроена верно.')
      return 'ok'
    } catch (e) {
      return 'Почта: ' + (e as Error).message.slice(0, 120)
    }
  }

  /** Оставляет на Диске последние KEEP_DISK архивов. */
  private async pruneDisk(dir: string) {
    const res = await fetch(this.dav(dir) + '/', { method: 'PROPFIND', headers: { Authorization: this.auth(), Depth: '1' }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return
    const names = [...(await res.text()).matchAll(/korean-[0-9-]+\.tar\.gz\.enc/g)].map(m => m[0]).filter((n, i, a) => a.indexOf(n) === i).sort()
    for (const old of names.slice(0, Math.max(0, names.length - KEEP_DISK))) {
      await fetch(this.dav(`${dir}/${old}`), { method: 'DELETE', headers: { Authorization: this.auth() }, signal: AbortSignal.timeout(30_000) })
    }
  }

  /* ---------- почта ---------- */
  /** Возвращает число писем; 0 — архив слишком велик для почты, ушло письмо без вложения. */
  private async sendMail(enc: string, name: string, size: number, disk: ArchiveResult['disk']) {
    const to = this.mailTo()
    const mb = (size / 1048576).toFixed(1)
    const where = disk === 'ok' ? `Копия лежит и на Яндекс Диске (папка «${this.folder()}»).` : ''
    const how = 'Открыть: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in файл.enc -out korean.tar.gz -pass pass:ВАШ_ПАРОЛЬ, потом tar -xzf korean.tar.gz. Подробности в docs/backup.md.'
    const n = Math.ceil(size / PART)
    if (n > MAX_PARTS) {
      await this.mail.send(to, '우리말: архив слишком большой для почты', `Полный архив (${mb} МБ) не помещается в письма. ${where || 'Он остался только на сервере: настройте Яндекс Диск.'}`)
      return 0
    }
    const fh = await open(enc, 'r')
    try {
      for (let i = 0; i < n; i++) {
        const part = n === 1 ? enc : `${enc}.part${i + 1}`
        if (n > 1) {
          const buf = Buffer.alloc(Math.min(PART, size - i * PART))
          await fh.read(buf, 0, buf.length, i * PART)
          writeFileSync(part, buf)
        }
        const fname = n === 1 ? name : `${name}.part${i + 1}`
        const text = n === 1 ? `Полный архив платформы, ${mb} МБ, зашифрован паролем BACKUP_PASSPHRASE. ${where}\n\n${how}` : `Часть ${i + 1} из ${n} полного архива (${mb} МБ). Склейте части по порядку: cat ${name}.part* > ${name}\n\n${how}`
        this.set(4, 82 + ((i + 0.5) / n) * 16)
        try {
          await this.mail.send(to, `우리말: резервная копия${n > 1 ? ` (часть ${i + 1} из ${n})` : ''}`, text, undefined, [{ filename: fname, path: part }])
        } finally {
          if (n > 1) rmSync(part, { force: true })
        }
      }
    } finally {
      await fh.close()
    }
    return n
  }

  /** На сервере остаются последние KEEP_LOCAL архивов. */
  private prune() {
    try {
      const files = readdirSync(OUT).filter(f => /^korean-.*\.enc$/.test(f)).sort()
      for (const f of files.slice(0, Math.max(0, files.length - KEEP_LOCAL))) rmSync(path.join(OUT, f), { force: true })
    } catch {
      /* чистка не критична */
    }
  }
}
