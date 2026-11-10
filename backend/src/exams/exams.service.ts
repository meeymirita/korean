/** Итоговая оценка: результаты экзаменов по правилам. Хранит только результат (лучший, последний, когда сдавать снова), задания строит сайт. */
import { BadRequestException, HttpException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { examMail } from '../mail/templates.js'
import { NotifyService } from '../notify/notify.service.js'
import { logError } from '../log.js'

const KEY = 'exams'
const NOTIFIED = 'exams:notified'
const LOG = 'exams:log'
/** Сколько последних попыток по правилу хранится с разбором. */
export const KEEP_ATTEMPTS = 10
export const DAY_MS = 86_400_000
/** Сдал: подтвердить через 30 дней. Не сдал или сдавал: пересдача не раньше чем через сутки. */
export const RECHECK_DAYS = 30
export const PASS = 0.85
/** Минимум верных по каждому правилу отдельно: сильные правила не вытягивают слабое. */
export const MIN_RULE = 0.7
/** С какой доли верных по правилу оно считается «своим». */
export const OWN_RULE = 0.8
const DRAFT = 'exams:draft'
const MAX_DRAFT = 600_000

export interface ExamResult {
  title: string
  /** лучший результат, доля 0–1 */
  best: number
  /** последний результат, доля 0–1 */
  last: number
  /** когда сдавал последний раз */
  at: number
  /** сдан ли (последняя попытка ≥ PASS) */
  passed: boolean
  /** разбивка по правилам последней попытки: id правила → верных и всего */
  rules: Record<string, { ok: number; total: number }>
  /** когда можно пересдать */
  retryAt: number
  /** когда нужно подтвердить (только у сданных) */
  dueAt: number | null
  tries: number
}
type Store = Record<string, ExamResult>

/** Одна ошибка в попытке: в каком блоке, что спрашивали, что ответил, как правильно. */
export interface ExamMistake { b: string; q: string; y: string; a: string }
export type RuleScores = Record<string, { ok: number; total: number }>
export interface ExamAttempt { at: number; right: number; total: number; passed: boolean; rules: RuleScores; mistakes: ExamMistake[] }

/** Разбивка по правилам из тела запроса: только числа, не больше 40 правил. */
export function cleanRules(v: unknown): RuleScores {
  const out: RuleScores = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [id, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
    if (!/^[a-z0-9_-]{1,40}$/i.test(id) || !Number.isInteger(o.ok) || !Number.isInteger(o.total)) continue
    const total = o.total as number
    const ok = o.ok as number
    if (total >= 1 && total <= 300 && ok >= 0 && ok <= total) out[id] = { ok, total }
  }
  return out
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
export function cleanMistakes(v: unknown): ExamMistake[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 120).flatMap(x => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
    const m = { b: text(o.b, 60), q: text(o.q, 300), y: text(o.y, 300), a: text(o.a, 300) }
    return m.q && m.a ? [m] : []
  })
}

@Injectable()
export class ExamsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  constructor(private readonly db: Db, private readonly notify: NotifyService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.remind().catch(e => logError('напоминание об экзамене:', (e as Error).message)), 10 * 60_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  private async read(): Promise<Store> {
    try {
      const v = JSON.parse((await this.db.getMeta(KEY)) ?? '{}')
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {}
    } catch {
      return {}
    }
  }

  /** Разбор попыток по правилу: новые сверху. */
  async log(id: string): Promise<{ attempts: ExamAttempt[] }> {
    try {
      const all = JSON.parse((await this.db.getMeta(LOG)) ?? '{}') as Record<string, ExamAttempt[]>
      return { attempts: Array.isArray(all[id]) ? all[id]! : [] }
    } catch {
      return { attempts: [] }
    }
  }

  async list() {
    return { results: await this.read(), pass: PASS, recheckDays: RECHECK_DAYS }
  }

  /** Записать попытку. Пересдача раньше чем через сутки не принимается (429). */
  async submit(body: { id?: unknown; title?: unknown; right?: unknown; total?: unknown; mistakes?: unknown; rules?: unknown }, now = Date.now()) {
    const id = typeof body.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(body.id) ? body.id : ''
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''
    const right = body.right
    const total = body.total
    if (!id || !title || typeof right !== 'number' || typeof total !== 'number' || !Number.isInteger(right) || !Number.isInteger(total) || total < 1 || total > 500 || right < 0 || right > total) {
      throw new BadRequestException({ error: 'неверный результат экзамена' })
    }
    const all = await this.read()
    const prev = all[id]
    if (prev && now < prev.retryAt) throw new HttpException({ error: 'пересдача через сутки', retryAt: prev.retryAt }, 429)
    const share = right / total
    const rules = cleanRules(body.rules)
    // сдан: верных не меньше PASS всего и не меньше MIN_RULE по каждому правилу
    const passed = share >= PASS && Object.values(rules).every(r => r.ok / r.total >= MIN_RULE)
    all[id] = {
      title,
      best: Math.max(prev?.best ?? 0, share),
      last: share,
      at: now,
      passed,
      rules,
      retryAt: now + DAY_MS,
      dueAt: passed ? now + RECHECK_DAYS * DAY_MS : null,
      tries: (prev?.tries ?? 0) + 1,
    }
    await this.db.setMeta(KEY, JSON.stringify(all))
    // разбор попытки: последние KEEP_ATTEMPTS, новые первыми
    let logs: Record<string, ExamAttempt[]> = {}
    try {
      logs = JSON.parse((await this.db.getMeta(LOG)) ?? '{}')
    } catch {
      /* битый журнал начинаем заново */
    }
    logs[id] = [{ at: now, right, total, passed, rules, mistakes: cleanMistakes(body.mistakes) }, ...(Array.isArray(logs[id]) ? logs[id]! : [])].slice(0, KEEP_ATTEMPTS)
    await this.db.setMeta(LOG, JSON.stringify(logs))
    return all[id]
  }

  /** Черновик экзамена между частями: задания всех частей и результаты сохранённых (null, пока часть не пройдена). */
  async draft() {
    try {
      return { draft: JSON.parse((await this.db.getMeta(DRAFT)) ?? 'null') as unknown }
    } catch {
      return { draft: null }
    }
  }

  async saveDraft(body: unknown) {
    const text = JSON.stringify(body ?? null)
    if (!body || typeof body !== 'object' || Array.isArray(body) || text.length > MAX_DRAFT) throw new BadRequestException({ error: 'неверный черновик экзамена' })
    await this.db.setMeta(DRAFT, text)
    return { ok: true }
  }

  async dropDraft() {
    await this.db.setMeta(DRAFT, 'null')
    return { ok: true }
  }

  /** Что пора пройти: сданные, у которых подошёл срок подтверждения; несданные через сутки. */
  due(all: Store, now = Date.now()) {
    return Object.entries(all).filter(([, r]) => (r.passed ? r.dueAt !== null && now >= r.dueAt : now >= r.retryAt)).map(([id, r]) => ({ id, title: r.title }))
  }

  /** Раз в день после 12:00 по времени сервера: одно сообщение со списком того, что пора пройти. */
  async remind(now = new Date()): Promise<'none' | 'early' | 'already' | 'sent' | 'failed'> {
    if (now.getHours() < 12) return 'early'
    const list = this.due(await this.read(), now.getTime())
    if (!list.length) return 'none'
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if ((await this.db.getMeta(NOTIFIED)) === day) return 'already'
    await this.db.setMeta(NOTIFIED, day)
    try {
      await this.notify.send(examMail(list.map(x => x.title), process.env.SITE_URL))
      return 'sent'
    } catch (e) {
      logError('напоминание об экзамене не отправилось:', (e as Error).message)
      return 'failed'
    }
  }
}
