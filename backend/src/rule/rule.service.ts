/**
 * «Правило дня»: в выбранное время в тему Telegram «Правило дня» приходит одна карточка грамматики (текст) и её картинка.
 * Берутся только пройденные (`ok`) карточки из «Мои карточки» (без подписи урока), как в открытом `/api/public/grammar`.
 * Выбор случайный без повторов, пока не пройдёт весь круг. Настройки (включено, время ЧЧ:ММ по часам сервера, день последней
 * отправки, уже присланные id) лежат в `meta.rule`; сообщение одно в день. Картинка: `korean_grammar/own-<id>.webp` на Диске (нет: только текст).
 */
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { Db } from '../db/db.service.js'
import { NotifyService } from '../notify/notify.service.js'
import { ruleMail, type RuleCard } from '../mail/templates.js'
import { dayOf } from '../reminders/reminder.service.js'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'
import { STUDY_GRAMMAR } from '../public/study.data.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'
import { logError } from '../log.js'

export interface RuleSettings {
  enabled: boolean
  /** ЧЧ:ММ */
  time: string
  /** день (ГГГГ-ММ-ДД), когда правило уже отправлено */
  lastSent: string
  /** id карточек, уже присланных в этом круге */
  seen: string[]
}

const DEFAULT: RuleSettings = { enabled: false, time: '10:00', lastSent: '', seen: [] }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

export type RuleTick = 'off' | 'early' | 'sent' | 'already' | 'notopic' | 'nocards' | 'failed'

let cached: (RuleCard & { lesson: string })[] | undefined

/** Карточки для отправки: пройденные и без подписи урока («Мои карточки»). */
export function ruleCards(): (RuleCard & { lesson: string })[] {
  cached ??= (JSON.parse(STUDY_GRAMMAR) as { grammar: (RuleCard & { lesson: string })[] }).grammar.filter(g => !g.lesson)
  return cached
}

@Injectable()
export class RuleService implements OnModuleInit {
  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
    private readonly disk: YaDiskService,
    private readonly jobs: BackgroundJobs,
  ) {}

  onModuleInit() {
    this.jobs.register('rule.tick', async () => {
      const result = await this.tick()
      if (result === 'failed') throw new Error('Не удалось отправить правило дня')
      return result
    })
  }

  async get(): Promise<RuleSettings> {
    try {
      const v = JSON.parse((await this.db.getMeta('rule')) ?? '{}') as Partial<RuleSettings>
      return {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT.enabled,
        time: typeof v.time === 'string' && TIME.test(v.time) ? v.time : DEFAULT.time,
        lastSent: typeof v.lastSent === 'string' ? v.lastSent : '',
        seen: Array.isArray(v.seen) ? v.seen.filter((x): x is string => typeof x === 'string') : [],
      }
    } catch {
      return { ...DEFAULT }
    }
  }

  private async save(s: RuleSettings) {
    await this.db.setMeta('rule', JSON.stringify(s))
  }

  async set(body: { enabled?: unknown; time?: unknown }, now = new Date()) {
    const cur = await this.get()
    const was = cur.enabled
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException({ error: 'invalid enabled' })
      cur.enabled = body.enabled
    }
    if (body.time !== undefined) {
      if (typeof body.time !== 'string' || !TIME.test(body.time)) throw new BadRequestException({ error: 'invalid time' })
      cur.time = body.time
    }
    // включили или сдвинули время, когда сегодняшнее время уже прошло: первое правило завтра, а не сразу (проверка есть кнопкой)
    if ((body.enabled === true && !was) || body.time !== undefined) cur.lastSent = hhmm(now) >= cur.time ? dayOf(now) : ''
    await this.save(cur)
    return await this.status()
  }

  async status() {
    const settings = await this.get()
    const { seen: _seen, ...rest } = settings
    const cards = ruleCards()
    return { ...rest, topicReady: this.notify.topicReady('rule'), cards: cards.length, left: cards.filter(c => !settings.seen.includes(c.id)).length }
  }

  /** Следующая карточка: случайная из ещё не присланных; круг закончился: список сбрасывается. */
  private pick(seen: string[]): { card: RuleCard; seen: string[] } | undefined {
    const cards = ruleCards()
    if (!cards.length) return undefined
    let fresh = cards.filter(c => !seen.includes(c.id))
    let base = seen
    if (!fresh.length) {
      fresh = cards
      base = []
    }
    const card = fresh[Math.floor(Math.random() * fresh.length)]!
    return { card, seen: [...base, card.id] }
  }

  /** Картинка карточки с Диска (JPEG, чтобы Telegram принял), нет файла или Диск не отвечает: undefined. */
  async photo(id: string): Promise<Buffer | undefined> {
    if (!this.disk.configured()) return undefined
    const dir = await mkdtemp(path.join(tmpdir(), 'rule-'))
    try {
      const file = path.join(dir, 'p.webp')
      await this.disk.download(`${DISK_DIRS.grammar}/own-${id}.webp`, file)
      return await sharp(await readFile(file)).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
    } catch {
      return undefined
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  private async deliver(card: RuleCard, time: string) {
    const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
    await this.notify.sendRule(ruleMail(card, { time, site: process.env.SITE_URL }), await this.photo(card.id), `🧡 <b>${esc(card.ko)}</b> — ${esc(card.ru)}`)
  }

  /** Одна проверка (раз в минуту). Возвращает, что сделано: для тестов. */
  async tick(now = new Date()): Promise<RuleTick> {
    const s = await this.get()
    if (!s.enabled) return 'off'
    const day = dayOf(now)
    if (hhmm(now) < s.time) return 'early'
    if (s.lastSent === day) return 'already'
    if (!this.notify.topicReady('rule')) return 'notopic'
    const next = this.pick(s.seen)
    if (!next) return 'nocards'
    // метка ставится до отправки: если Telegram медленный, следующая проверка не пошлёт второе правило
    await this.save({ ...s, lastSent: day })
    try {
      await this.deliver(next.card, s.time)
      await this.save({ ...s, lastSent: day, seen: next.seen })
      return 'sent'
    } catch (e) {
      logError('правило дня не отправилось:', (e as Error).message)
      await this.save({ ...s, lastSent: '' })
      return 'failed'
    }
  }

  /** Проверочное правило по кнопке: не зависит от времени, не трогает круг и день отправки. */
  async test() {
    if (!this.notify.topicReady('rule')) return { ok: false, message: 'тема «Правило дня» не подключена: нужен TELEGRAM_TOPIC_RULE в .env' }
    const s = await this.get()
    const next = this.pick(s.seen)
    if (!next) return { ok: false, message: 'нет пройденных карточек в «Мои карточки»' }
    try {
      await this.deliver(next.card, s.time)
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: 'Отправка: ' + (e as Error).message.slice(0, 120) }
    }
  }
}
