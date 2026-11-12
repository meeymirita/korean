import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { logError } from '../log.js'
import { studyCaption } from '../mail/templates.js'
import { NotifyService } from '../notify/notify.service.js'
import { modeName } from './mode-names.js'
import { renderWeeklyPdf, weekLabel, type WeeklySpec } from './weekly-pdf.js'

/** Сколько строк ошибок попадает в лист (повторы одной ошибки идут одной строкой). */
const MAX_MISTAKES = 60
/** Перерыв между ответами длиннее этого во время упражнения не считается. */
const GAP = 120_000

const two = (n: number) => String(n).padStart(2, '0')
/** День по часам сервера: ГГГГ-ММ-ДД. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

interface Row {
  t: bigint | number
  ok: number
  mode: string
  detail: string
}

function detail(s: string): { q?: string; a?: string; y?: string } {
  try {
    return JSON.parse(s) as { q?: string; a?: string; y?: string }
  } catch {
    return {}
  }
}

/** Собирает данные листа из ответов и времени по таймеру за семь дней, которые заканчиваются днём `now`. */
export function weeklySpec(rows: Row[], time: Record<string, number>, now: Date): Omit<WeeklySpec, 'banner'> {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i, 12)
    return { day: dayOf(d), ok: 0, bad: 0, seconds: time[dayOf(d)] ?? 0 }
  })
  const byDay = new Map(days.map(d => [d.day, d]))
  const modes = new Map<string, { name: string; ok: number; bad: number; days: Set<string>; seconds: number; last: number }>()
  const wrong = new Map<string, WeeklySpec['mistakes'][number]>()
  let mistakesTotal = 0
  for (const r of [...rows].sort((a, b) => Number(a.t) - Number(b.t))) {
    const t = Number(r.t)
    const day = byDay.get(dayOf(new Date(t)))
    if (!day) continue
    if (r.ok) day.ok++
    else day.bad++
    let m = modes.get(r.mode)
    if (!m) modes.set(r.mode, (m = { name: modeName(r.mode), ok: 0, bad: 0, days: new Set(), seconds: 0, last: 0 }))
    if (r.ok) m.ok++
    else m.bad++
    m.days.add(day.day)
    if (m.last && t - m.last <= GAP) m.seconds += (t - m.last) / 1000
    m.last = t
    if (!r.ok) {
      mistakesTotal++
      const d = detail(r.detail)
      // без вопроса строка ничего не скажет: такие ошибки только в общем числе
      if (!d.q) continue
      const key = `${r.mode}|${d.q}|${d.a ?? ''}`
      const w = wrong.get(key)
      if (w) {
        w.n++
        w.y = d.y ?? w.y
      } else wrong.set(key, { mode: m.name, q: d.q, a: d.a ?? '', y: d.y ?? '', n: 1 })
    }
  }
  return {
    days,
    modes: [...modes.values()]
      .map(m => ({ name: m.name, ok: m.ok, bad: m.bad, days: m.days.size, seconds: Math.round(m.seconds) }))
      .sort((a, b) => b.ok + b.bad - (a.ok + a.bad)),
    mistakes: [...wrong.values()].sort((a, b) => b.n - a.n).slice(0, MAX_MISTAKES),
    mistakesTotal,
    made: `${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}, ${two(now.getHours())}:${two(now.getMinutes())}`,
  }
}

/**
 * Недельный отчёт по занятиям: раз в неделю сервер сам рисует PDF (ответы и время по таймеру за семь дней) и шлёт его в тему «Отчёт по занятиям».
 * По умолчанию воскресенье 20:00 по времени сервера: STUDY_WEEKDAY (0–6, 0 воскресенье), STUDY_TIME (ЧЧ:ММ), STUDY_WEEKLY=0 выключает.
 */
@Injectable()
export class StudyWeeklyService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor(
    private readonly db: Db,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    if (process.env.STUDY_WEEKLY === '0') return
    this.timer = setInterval(() => void this.weekly().catch(e => logError('недельный отчёт по занятиям:', (e as Error).message)), Number(process.env.REPORT_WATCH_MS) || 60_000)
    this.timer.unref()
  }

  onModuleDestroy() {
    clearInterval(this.timer)
  }

  /**
   * Раз в минуту: пора ли слать. Метка дня в meta `study:weekly` ставится до отправки: второй раз за день не пошлём, даже если Telegram не принял (ошибка в журнале).
   * Тема не настроена: ничего не делаем и метку не ставим. За неделю не было ни ответов, ни времени: не шлём пустой лист.
   */
  async weekly(now = new Date()): Promise<'off' | 'early' | 'already' | 'empty' | 'sent' | 'failed'> {
    const weekday = process.env.STUDY_WEEKDAY === undefined || process.env.STUDY_WEEKDAY === '' ? 0 : Number(process.env.STUDY_WEEKDAY)
    const time = /^\d{1,2}:\d{2}$/.test(process.env.STUDY_TIME ?? '') ? process.env.STUDY_TIME!.padStart(5, '0') : '20:00'
    if (now.getDay() !== weekday || !this.notify.topicReady('study')) return 'off'
    if (`${two(now.getHours())}:${two(now.getMinutes())}` < time) return 'early'
    const day = dayOf(now)
    if ((await this.db.getMeta('study:weekly')) === day) return 'already'
    await this.db.setMeta('study:weekly', day)
    try {
      return (await this.send(now)) ? 'sent' : 'empty'
    } catch (e) {
      logError('недельный отчёт по занятиям не отправился:', (e as Error).message)
      return 'failed'
    }
  }

  /** Собирает и отправляет отчёт за семь дней до `now` включительно. false: за неделю ничего не было (при `force` пустой лист всё равно уходит). */
  async send(now = new Date(), force = false): Promise<boolean> {
    const spec = await this.spec(now)
    const answers = spec.days.reduce((s, d) => s + d.ok + d.bad, 0)
    const seconds = spec.days.reduce((s, d) => s + d.seconds, 0)
    if (!force && !answers && !seconds) return false
    const pdf = await renderWeeklyPdf({ ...spec, banner: await this.banner() })
    const from = spec.days[0]!.day
    const to = spec.days.at(-1)!.day
    const caption = studyCaption({ when: weekLabel(from, to), seconds, answers, ok: spec.days.reduce((s, d) => s + d.ok, 0) }, 'Отчёт за неделю')
    await this.notify.sendFileToTopic('study', `nedelya-${from}-${to}.pdf`, pdf, caption, 'application/pdf')
    return true
  }

  /** Данные листа из базы: ответы и время по таймеру за семь дней. */
  async spec(now = new Date()) {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const orm = await this.db.orm()
    const rows = await orm.answer.findMany({ where: { t: { gte: BigInt(from.getTime()), lt: BigInt(to.getTime()) } }, select: { t: true, ok: true, mode: true, detail: true } })
    const days = Array.from({ length: 7 }, (_, i) => dayOf(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12)))
    const time = await orm.studyTime.findMany({ where: { day: { in: days } } })
    return weeklySpec(rows, Object.fromEntries(time.map(r => [r.day, Number(r.seconds)])), now)
  }

  /** Картинка шапки: баннер темы с сайта (там же, откуда его берёт Telegram). Не скачался: лист будет с текстовой шапкой. */
  async banner(): Promise<Buffer | undefined> {
    if (process.env.TELEGRAM_DUMP_FILE) return undefined
    try {
      const base = (process.env.TELEGRAM_BANNER_BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')
      const res = await fetch(`${base}/tg/tg-study.png`, { signal: AbortSignal.timeout(8000) })
      return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined
    } catch {
      return undefined
    }
  }
}
