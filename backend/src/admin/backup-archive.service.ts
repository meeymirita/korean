/**
 * Полный архив платформы по кнопке в кабинете (и раз в неделю сам): база + картинки + файлы календаря + настройки,
 * сжат (tar.gz) и зашифрован паролем BACKUP_PASSPHRASE (openssl, AES-256), потом уходит на почту (вложением, при большом размере частями).
 * Переменные в backend/.env: BACKUP_PASSPHRASE; BACKUP_MAIL_TO (по умолчанию почта из двухфакторной защиты).
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { TwoFaService } from '../auth/twofa.service.js'
import { DATA_DIR, ROOT } from '../config.js'
import { postgresDumpConfig } from '../db/postgres-dump.js'
import { MailService } from '../mail/mail.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { BACKUP_FOLDER_RE, DISK_DIRS, YaDiskService, backupFolder } from '../yadisk/yadisk.service.js'
import { backupMail } from '../mail/templates.js'

/** Конфиги сервера, которые кладём в архив (что не прочиталось, пропускается). */
const CONFIG_FILES = [
  '/etc/caddy/Caddyfile',
  '/etc/systemd/system/progress.service',
  '/etc/systemd/system/korean-backup.service',
  '/etc/systemd/system/korean-backup.timer',
  '/etc/korean-backup.env',
]
const CONFIG_DIRS = ['/etc/caddy/conf.d', '/etc/systemd/system/progress.service.d']
const OUT = path.join(DATA_DIR, 'export')
const FILE = path.join(DATA_DIR, 'backup-archive.json')
/** Одно письмо — не больше 18 МБ вложения (у Яндекса лимит около 30 МБ, а вложение растёт на треть при пересылке), частей не больше 5. */
const PART = 18 * 1024 * 1024
const MAX_PARTS = 5
const KEEP_LOCAL = 2
/** На Диске в каждой папке остаются последние архивы. */
const KEEP_DISK = Number(process.env.YADISK_KEEP) > 0 ? Number(process.env.YADISK_KEEP) : 14
/** Как часто собирать архив сам: по умолчанию каждый день (`BACKUP_EVERY_DAYS=7` вернёт раз в неделю). */
const everyMs = () => (Number(process.env.BACKUP_EVERY_DAYS) > 0 ? Number(process.env.BACKUP_EVERY_DAYS) : 1) * 86_400_000
/** запас на разброс по часам: вчерашний архив в 4:05 не должен мешать сегодняшнему в 4:00 */
const SLACK = 4 * 3_600_000
/** Ночная копия считается пропавшей, если новой нет дольше этого. */
export const STALE_MS = 36 * 3600_000
const SCRIPT_STATUS = path.join(DATA_DIR, 'backup-status.json')
const ALERT = path.join(DATA_DIR, 'backup-alert.json')
export const STEPS = ['Снимок базы', 'Сжатие файлов', 'Шифрование', 'Отправка'] as const

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
  /** Яндекс.Диск: ok — загружено (тогда почта не нужна), off — не настроен */
  disk?: 'ok' | 'off' | 'fail'
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
    private readonly mail: MailService,
    private readonly twofa: TwoFaService,
    private readonly disk: YaDiskService,
    private readonly notify: NotifyService,
  ) {}

  /** Раз в час: раз в сутки собирает архив сам (после 4 утра по времени сервера, если есть пароль и куда отправлять) и следит за ночной копией. */
  onModuleInit() {
    this.timer = setInterval(() => void this.watch(), Number(process.env.BACKUP_WATCH_MS) || 3600_000)
    this.timer.unref()
    // через минуту после старта: докладываем на Диск картинки и файлы, которых там нет (после загрузки пачкой или сбоя связи)
    if (this.disk.configured()) setTimeout(() => void this.disk.syncMedia().catch(e => console.error('Диск: синхронизация картинок', (e as Error).message)), Number(process.env.YADISK_SYNC_DELAY_MS) || 60_000).unref()
  }

  private async watch() {
    const last = this.last()
    if (process.env.BACKUP_AUTO !== '0' && !(await this.problems()).length && new Date().getHours() >= 4 && Date.now() - (last?.time ?? 0) > everyMs() - SLACK) void this.start()
    if (this.disk.configured()) void this.disk.syncMedia().catch(() => undefined)
    await this.watchNightly()
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
    if (!this.notify.ready(await this.mailTo())) return 'quiet'
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
      await this.notify.send(m, await this.mailTo())
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

  private async mailTo() {
    return process.env.BACKUP_MAIL_TO || await this.twofa.email()
  }
  private async mailOn() {
    return this.mail.configured() && !!await this.mailTo()
  }

  /** Чего не хватает для запуска (пусто — можно запускать). */
  async problems(): Promise<string[]> {
    const p: string[] = []
    if (!process.env.BACKUP_PASSPHRASE) p.push('не задан пароль архива BACKUP_PASSPHRASE в backend/.env')
    if (!this.disk.configured() && !await this.mailOn()) p.push('некуда отправлять: подключите Яндекс.Диск (YADISK_TOKEN) или почту (SMTP_* и BACKUP_MAIL_TO) в .env')
    return p
  }

  /** Куда уйдёт архив: показывает кабинет до запуска. */
  async targets() {
    return { mail: await this.mailOn(), disk: this.disk.configured(), passphrase: !!process.env.BACKUP_PASSPHRASE }
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
    const bad = await this.problems()
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
      const dump = postgresDumpConfig(path.join(stage, 'app.dump'))
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.env.PG_DUMP_BIN || 'pg_dump', dump.args, {
          env: { ...process.env, ...dump.env },
          stdio: ['ignore', 'ignore', 'pipe'],
        })
        let stderr = ''
        child.stderr.on('data', chunk => { stderr += chunk })
        child.once('error', reject)
        child.once('close', code => code === 0 ? resolve() : reject(new Error(`pg_dump: ${stderr.trim().slice(0, 200) || `код ${code}`}`)))
      })
      // .env рядом с backend/ (в Docker корневой .env проекта смонтирован как /app/.env): без него на новом сервере не будет токена и ключей
      try {
        writeFileSync(path.join(stage, 'server.env'), readFileSync(path.join(ROOT, '.env')), { mode: 0o600 })
      } catch {
        /* .env нет или он не читается этим пользователем: архив всё равно собирается (в Docker файл должен принадлежать uid 1000, это делает scripts/init-env.sh) */
      }
      // конфиги сервера, без которых заново не поднять (если процесс может их прочитать)
      const cfg = path.join(stage, 'config')
      const have: string[] = []
      for (const f of CONFIG_FILES) {
        try {
          mkdirSync(cfg, { recursive: true, mode: 0o700 })
          writeFileSync(path.join(cfg, path.basename(f)), readFileSync(f), { mode: 0o600 })
          have.push(path.basename(f))
        } catch {
          /* нет файла или нет прав: так бывает на чужой машине */
        }
      }
      for (const d of CONFIG_DIRS) {
        try {
          for (const n of readdirSync(d)) {
            const file = path.join(d, n)
            if (!statSync(file).isFile()) continue
            const to = `${path.basename(d)}-${n}`
            mkdirSync(cfg, { recursive: true, mode: 0o700 })
            writeFileSync(path.join(cfg, to), readFileSync(file), { mode: 0o600 })
            have.push(to)
          }
        } catch {
          /* папки нет или нет прав */
        }
      }
      // инструкция восстановления лежит рядом с архивом: на новом сервере репозитория ещё нет (в Docker папка docs смонтирована в /app/docs)
      const guide = [path.join(ROOT, '..', 'docs', 'backup.md'), path.join(ROOT, 'docs', 'backup.md')].find(existsSync)
      if (guide) writeFileSync(path.join(stage, 'backup.md'), readFileSync(guide))
      const stack = [path.join(ROOT, '..', 'docs', 'docker.md'), path.join(ROOT, 'docs', 'docker.md')].find(existsSync)
      if (stack) writeFileSync(path.join(stage, 'docker.md'), readFileSync(stack))
      const sizes = ['uploads', 'docs', 'thumbs', 'public', 'site'].map(d => {
        const dir = path.join(DATA_DIR, d)
        return `  ${d}: ${existsSync(dir) ? Math.round(dirSize(dir) / 1024) + ' КБ' : 'нет папки'}`
      })
      writeFileSync(
        path.join(stage, 'manifest.txt'),
        [
          `дата: ${new Date().toISOString()}`,
          `база: app.dump, ${Math.round(statSync(path.join(stage, 'app.dump')).size / 1024)} КБ`,
          'папки:',
          ...sizes,
          '  (docs — файлы, приложенные к планам в календаре; пуста, пока ничего не прикрепляли)',
          `конфиги: ${have.length ? have.join(', ') : 'не прочитались (нет прав), их нужно сохранить отдельно'}`,
          `секреты: server.env`,
          guide ? 'восстановление: backup.md и docker.md в этом архиве' : 'восстановление: docs/backup.md и docs/docker.md в репозитории',
          '',
        ].join('\n'),
      )

      // база и .env отдельным маленьким архивом (на Диск в «База и env»): чтобы достать их, не качая весь сайт
      const dbName = `db-env-${stamp}.tar.gz.enc`
      const dbTar = path.join(OUT, `db-env-${stamp}.tar.gz`)
      const dbEnc = path.join(OUT, dbName)
      const dbFiles = ['app.dump', 'server.env'].filter(f => existsSync(path.join(stage, f)))

      // 2. сжатие: процент считаем по размеру готового файла относительно исходных данных
      this.set(1, 8)
      const dirs = ['uploads', 'docs', 'thumbs', 'public', 'site'].filter(d => existsSync(path.join(DATA_DIR, d)))
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

      // 4а. Яндекс.Диск: полный архив в «Копия сайта», база и .env в «База и env»
      let disk: NonNullable<ArchiveResult['disk']> = 'off'
      if (this.disk.configured()) {
        this.set(3, 58)
        try {
          await run('tar', ['-czf', dbTar, '-C', stage, ...dbFiles])
          await run('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', dbTar, '-out', dbEnc, '-pass', 'env:BACKUP_PASSPHRASE'], { BACKUP_PASSPHRASE: pass })
          const folder = backupFolder()
          await this.disk.upload(`${folder}/${DISK_DIRS.db}/${dbName}`, dbEnc)
          this.set(3, 66)
          await this.disk.upload(`${folder}/${DISK_DIRS.site}/${name}`, enc)
          this.set(3, 82)
          // картинки: сначала живая папка догоняет сервер, потом копия внутрь этой папки прямо на Диске
          await this.disk.syncMedia()
          await this.disk.copy(DISK_DIRS.media, `${folder}/${DISK_DIRS.media}`)
          await this.pruneDisk()
          disk = 'ok'
        } catch (e) {
          disk = 'fail'
          notes.push('Диск: ' + (e as Error).message.slice(0, 150))
          try {
            const m = backupMail({ kind: 'disk-fail', detail: (e as Error).message.slice(0, 150) })
            await this.notify.send(m, await this.mailTo())
          } catch {
            /* некуда слать: ошибка видна в кабинете */
          }
        } finally {
          rmSync(dbTar, { force: true })
          rmSync(dbEnc, { force: true })
        }
      }

      // 4. почта: одно письмо или несколько частей
      let mail: ArchiveResult['mail'] = 'off'
      let parts = 0
      // почта остаётся запасным путём: письмо уходит, только если Диск не настроен или не принял архив
      if (disk !== 'ok' && await this.mailOn()) {
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
      const sent = mail === 'ok' || disk === 'ok'
      return {
        ok: sent,
        time: Date.now(),
        name,
        sizeKb: Math.round(size / 1024),
        mail,
        disk,
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
    if (this.disk.configured()) {
      try {
        await this.disk.put('проверка связи.txt', Buffer.from(`Проверка связи: ${new Date().toISOString()}\n`))
        return { mail: 'ok' as const, disk: 'ok' as const, message: '' }
      } catch (e) {
        return { mail: 'fail' as const, disk: 'fail' as const, message: 'Диск: ' + (e as Error).message.slice(0, 120) }
      }
    }
    if (!await this.mailOn()) return { mail: 'off' as const, message: 'некуда отправлять: настройте почту (SMTP_* в backend/.env) и адрес BACKUP_MAIL_TO' }
    try {
      const m = backupMail({ kind: 'test' })
      await this.mail.send(await this.mailTo(), m.subject, m.text, m.html)
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
    const to = await this.mailTo()
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

  /** На Диске в каждой папке остаются последние KEEP_DISK архивов. */
  private async pruneDisk() {
    try {
      const dirs = (await this.disk.list('')).filter(i => i.type === 'dir' && BACKUP_FOLDER_RE.test(i.name)).map(i => i.name).sort()
      for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP_DISK))) await this.disk.remove(d)
    } catch {
      /* чистка не критична */
    }
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
