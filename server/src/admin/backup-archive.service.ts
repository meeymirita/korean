/**
 * Полный архив платформы по кнопке в кабинете (и раз в неделю сам): база + картинки + файлы календаря + настройки,
 * сжат (tar.gz) и зашифрован паролем BACKUP_PASSPHRASE (openssl, AES-256), потом уходит на почту (вложением, при большом размере частями).
 * Переменные в server/.env: BACKUP_PASSPHRASE; BACKUP_MAIL_TO (по умолчанию почта из двухфакторной защиты).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { TwoFaService } from '../auth/twofa.service'
import { DATA_DIR, ROOT } from '../config'
import { Db } from '../db/db.service'
import { MailService } from '../mail/mail.service'
import { backupMail } from '../mail/templates'

const OUT = path.join(DATA_DIR, 'export')
const FILE = path.join(DATA_DIR, 'backup-archive.json')
/** Одно письмо — не больше 18 МБ вложения (у Яндекса лимит около 30 МБ, а вложение растёт на треть при пересылке), частей не больше 5. */
const PART = 18 * 1024 * 1024
const MAX_PARTS = 5
const KEEP_LOCAL = 2
/** Как часто собирать архив сам: по умолчанию каждый день (`BACKUP_EVERY_DAYS=7` вернёт раз в неделю). */
const everyMs = () => (Number(process.env.BACKUP_EVERY_DAYS) > 0 ? Number(process.env.BACKUP_EVERY_DAYS) : 1) * 86_400_000
/** запас на разброс по часам: вчерашний архив в 4:05 не должен мешать сегодняшнему в 4:00 */
const SLACK = 4 * 3_600_000
/** Ночная копия считается пропавшей, если новой нет дольше этого. */
export const STALE_MS = 36 * 3600_000
const SCRIPT_STATUS = path.join(DATA_DIR, 'backup-status.json')
const ALERT = path.join(DATA_DIR, 'backup-alert.json')
export const STEPS = ['Снимок базы', 'Сжатие файлов', 'Шифрование', 'Почта'] as const

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

  /** Раз в час: раз в сутки собирает архив сам (после 4 утра по времени сервера, если есть пароль и куда отправлять) и следит за ночной копией. */
  onModuleInit() {
    this.timer = setInterval(() => {
      const last = this.last()
      if (process.env.BACKUP_AUTO !== '0' && !this.problems().length && new Date().getHours() >= 4 && Date.now() - (last?.time ?? 0) > everyMs() - SLACK) void this.start()
      void this.watchNightly()
    }, Number(process.env.BACKUP_WATCH_MS) || 3600_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /**
   * Следит за ночной копией (scripts/backup.sh пишет backup-status.json): если скрипт сообщил об ошибке или новой копии нет дольше
   * STALE_MS, шлёт одно письмо на каждый случай (метка в backup-alert.json, чтобы не повторять каждый час). Пока скрипт ни разу не запускался, молчит.
   */
  async watchNightly(now = Date.now()): Promise<'ok' | 'sent' | 'quiet' | 'off'> {
    let s: { ok?: unknown; time?: unknown; message?: unknown }
    try {
      s = JSON.parse(readFileSync(SCRIPT_STATUS, 'utf8'))
    } catch {
      return 'off'
    }
    const time = Number(s.time) || 0
    const failed = s.ok === false
    const stale = !failed && now - time > STALE_MS
    if (!failed && !stale) return 'ok'
    if (!this.mailOn()) return 'quiet'
    const key = failed ? `fail-${time}` : `stale-${new Date(now).toISOString().slice(0, 10)}`
    let seen = ''
    try {
      seen = (JSON.parse(readFileSync(ALERT, 'utf8')) as { key?: string }).key ?? ''
    } catch {
      /* письма ещё не было */
    }
    if (seen === key) return 'quiet'
    try {
      const hours = Math.floor((now - time) / 3600_000)
      const m = backupMail(
        failed
          ? { kind: 'nightly-fail', detail: typeof s.message === 'string' ? s.message.slice(0, 200) : '' }
          : { kind: 'stale', detail: time ? `уже ${hours} ч` : undefined },
      )
      await this.mail.send(this.mailTo(), m.subject, m.text, m.html)
      writeFileSync(ALERT, JSON.stringify({ key, time: now }))
      return 'sent'
    } catch (e) {
      console.error('письмо о ночной копии не отправилось:', (e as Error).message)
      return 'quiet'
    }
  }

  last(): ArchiveResult | null {
    try {
      return JSON.parse(readFileSync(FILE, 'utf8')) as ArchiveResult
    } catch {
      return null
    }
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
    if (!this.mailOn()) p.push('некуда отправлять: настройте почту (SMTP_* в server/.env) и адрес BACKUP_MAIL_TO')
    return p
  }

  /** Куда уйдёт архив: показывает кабинет до запуска. */
  targets() {
    return { mail: this.mailOn(), passphrase: !!process.env.BACKUP_PASSPHRASE }
  }

  /** Запуск в фоне; false, если уже идёт. */
  start(): boolean {
    if (this.job.running) return false
    this.job = { running: true, step: 0, percent: 0, started: Date.now() }
    void this.build().then(
      r => this.finish(r),
      e => this.finish({ ok: false, time: Date.now(), name: '', sizeKb: 0, mail: 'off', parts: 0, message: (e as Error).message.slice(0, 300) }),
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

      const notes: string[] = []

      // 4. почта: одно письмо или несколько частей
      let mail: ArchiveResult['mail'] = 'off'
      let parts = 0
      if (this.mailOn()) {
        this.set(3, 60)
        try {
          parts = await this.sendMail(enc, name, size)
          mail = parts ? 'ok' : 'big'
        } catch (e) {
          mail = 'fail'
          notes.push('Почта: ' + (e as Error).message)
        }
      }

      this.prune()
      const sent = mail === 'ok'
      return {
        ok: sent,
        time: Date.now(),
        name,
        sizeKb: Math.round(size / 1024),
        mail,
        parts,
        message: sent ? notes.join('; ') : notes.join('; ') || 'архив собран, но не отправлен',
      }
    } finally {
      rmSync(stage, { recursive: true, force: true })
      rmSync(tar, { force: true })
    }
  }

  /** Проверка почты без сборки архива: короткое письмо. Пароль архива не нужен. */
  async test() {
    if (!this.mailOn()) return { mail: 'off' as const, message: 'некуда отправлять: настройте почту (SMTP_* в server/.env) и адрес BACKUP_MAIL_TO' }
    try {
      const m = backupMail({ kind: 'test' })
      await this.mail.send(this.mailTo(), m.subject, m.text, m.html)
      return { mail: 'ok' as const, message: '' }
    } catch (e) {
      const message = 'Почта: ' + (e as Error).message.slice(0, 120)
      console.error('проверка отправки копий:', message)
      return { mail: 'fail' as const, message }
    }
  }

  /* ---------- почта ---------- */
  /** Возвращает число писем; 0 — архив слишком велик для почты, ушло письмо без вложения. */
  private async sendMail(enc: string, name: string, size: number) {
    const to = this.mailTo()
    const mb = (size / 1048576).toFixed(1)
    const n = Math.ceil(size / PART)
    if (n > MAX_PARTS) {
      const m = backupMail({ kind: 'big', mb })
      await this.mail.send(to, m.subject, m.text, m.html)
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
        const m = backupMail({ kind: 'archive', name, mb, part: n > 1 ? { i: i + 1, n } : undefined })
        this.set(3, 60 + ((i + 0.5) / n) * 38)
        try {
          await this.mail.send(to, m.subject, m.text, m.html, [{ filename: fname, path: part }])
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
