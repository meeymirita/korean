/**
 * Прогресс владельца в базе. Сайт шлёт короткие «действия» (ответ, профиль, настройки, сброс, импорт) на POST /api/ops,
 * сервер раскладывает их по таблицам answers / words / days / meta, а GET /api/progress собирает из них тот же объект,
 * который сайт использовал раньше. Правила (что считается выученным, как растёт серия) повторяют сайт: см. tests/parity.test.mjs.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { pruneImages } from '../images/images.service.js'
import { ACHIEVEMENTS, DAILY, DAILY_ALL, GRAMMAR_MODES, WEEKLY } from './coins.js'
import { Profile, Settings } from './progress.types.js'

/** Слово считается выученным после стольких верных ответов подряд. */
/** очков слова, с которых оно выучено (верный ответ +1, ошибка −1) */
const KNOWN_STREAK = 5
const GOALS = [10, 20, 50]

/** Монетки Юны: цены и награды живут тут и в src/data/coins.ts (менять в обоих). */
export const COINS = {
  answer: 2, // за верный ответ
  dayCap: 300, // потолок монеток за ответы в день
  combo: { 5: 3, 10: 7 } as Record<number, number>, // за 5 и 10 верных подряд (один раз за серию)
  round: 5, // за завершённую серию заданий
  gift: 100, // подарок при первом запуске
  wrongXp: 3, // ошибка отнимает очки, но не ниже начала текущего уровня
}
/** Очки, с которых начинается уровень L (как xpFor в src/data/levels.ts). */
const xpFor = (L: number) => 30 * L * (L - 1)
const levelOf = (xp: number) => Math.min(40, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 30)) / 2))
const LOG_LIMIT = 1000
const MAX_OPS = 500
const DAY = /^\d{4}-\d{2}-\d{2}$/
const localDay = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const bad = (msg: string): never => {
  throw new BadRequestException({ error: msg })
}
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : bad('invalid op'))
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : bad('invalid op'))

/** День «ГГГГ-ММ-ДД» по местному времени: без Intl, в сотни раз быстрее toLocaleDateString на больших выборках. */
function dayKeyOf(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDetail(s: string): Record<string, string> {
  try {
    return JSON.parse(s) as Record<string, string>
  } catch {
    return {}
  }
}

const DEFAULT_PROFILE: Profile = { name: '', avatar: '🌸', cover: '' }
const IMAGE_ID = /^[a-f0-9]{16}$/
/** За одно действие таймера можно записать не больше часа. */
const MAX_TIME_OP = 3600
const DEFAULT_SETTINGS: Settings = { goal: 20, cats: [], gameCats: null, marks: [], keys: {} }
const MARK = /^[wgdu]:.{1,40}$/
const MAX_MARKS = 500
const KEY_ID = /^(nav|cab):[a-z]{1,20}$/
const KEY_COMBO = /^mod(\+alt)?(\+shift)?\+[A-Za-z0-9]{1,20}$/
const MAX_KEYS = 40
const MOOD_DAYS = 400
const MOODS = ['easy', 'ok', 'hard'] as const

@Injectable()
export class ProgressService {
  constructor(private readonly db: Db) {}

  private async json<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await this.db.getMeta(key)
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
    } catch {
      return fallback
    }
  }

  /** Весь прогресс одним объектом, как его ждёт сайт (поле v: 1). */
  /**
   * Отчёт по режимам: по каждой паре «раздел + режим» ответы, верные, дни занятий, последний раз и примерное время
   * (промежутки между ответами до 90 секунд, после долгой паузы засчитывается 15 секунд на ответ). Общее время берётся из таймера занятий.
   */
  async report(days: number) {
    const since = days ? Date.now() - days * 86_400_000 : 0
    const sinceDay = days ? dayKeyOf(since) : ''
    const rows = new Map<string, { source: string; mode: string; ok: number; bad: number; days: Set<string>; first: number; last: number; sec: number }>()
    const answers = (await (await this.db.orm()).answer.findMany({ where: { t: { gte: BigInt(since) } }, orderBy: { t: 'asc' }, select: { t: true, ok: true, source: true, mode: true } })).map(a => ({ ...a, t: Number(a.t) }))
    const dayOf = dayKeyOf
    let prev = 0
    for (const a of answers) {
      const key = a.source + '\u0000' + a.mode
      let r = rows.get(key)
      if (!r) rows.set(key, (r = { source: a.source, mode: a.mode, ok: 0, bad: 0, days: new Set(), first: a.t, last: a.t, sec: 0 }))
      if (a.ok) r.ok++
      else r.bad++
      r.days.add(dayOf(a.t))
      r.last = Math.max(r.last, a.t)
      const gap = prev ? (a.t - prev) / 1000 : Infinity
      r.sec += gap <= 90 ? gap : 15
      prev = a.t
    }
    const study = (await (await this.db.orm()).studyTime.findMany({ where: sinceDay ? { day: { gte: sinceDay } } : undefined, select: { day: true, seconds: true } })).map(s => ({ ...s, seconds: Number(s.seconds) }))
    const answerDays = new Set(answers.map(a => dayOf(a.t)))
    return {
      days,
      totals: {
        ok: answers.filter(a => a.ok).length,
        bad: answers.filter(a => !a.ok).length,
        activeDays: new Set([...answerDays, ...study.filter(s => s.seconds > 0).map(s => s.day)]).size,
        seconds: study.reduce((n, s) => n + s.seconds, 0),
      },
      rows: [...rows.values()]
        .map(r => ({ source: r.source, mode: r.mode, ok: r.ok, bad: r.bad, days: r.days.size, first: r.first, last: r.last, seconds: Math.round(r.sec) }))
        .sort((a, b) => b.ok + b.bad - (a.ok + a.bad)),
    }
  }

  /** Ответы по часу дня (0–23, местное время сервера) за период — паттерн усталости: в какое время суток больше ошибок. */
  async clock(days: number) {
    const since = days ? Date.now() - days * 86_400_000 : 0
    const rows = (await (await this.db.orm()).answer.findMany({ where: { t: { gte: BigInt(since) } }, select: { t: true, ok: true } })).map(a => ({ ...a, t: Number(a.t) }))
    const hours = Array.from({ length: 24 }, () => ({ ok: 0, bad: 0 }))
    for (const r of rows) {
      const h = hours[new Date(r.t).getHours()]!
      if (r.ok) h.ok++
      else h.bad++
    }
    return { days, hours }
  }

  /** «Эта неделя vs прошлая»: ответы и время занятий за последние 7 дней против предыдущих 7. */
  async weekCompare() {
    const now = Date.now()
    const week = 7 * 86_400_000
    const curSince = now - week
    const prevSince = now - 2 * week
    const orm = await this.db.orm()
    const sum = async (gte: number, lt?: number) => {
      const range = lt === undefined ? { gte: BigInt(gte) } : { gte: BigInt(gte), lt: BigInt(lt) }
      const [ok, bad] = await Promise.all([
        orm.answer.count({ where: { t: range, ok: 1 } }),
        orm.answer.count({ where: { t: range, ok: 0 } }),
      ])
      return { ok, bad }
    }
    const curDay = dayKeyOf(curSince)
    const prevDay = dayKeyOf(prevSince)
    const secondsOf = async (fromDay: string, toDay?: string) =>
      (toDay
        ? orm.studyTime.findMany({ where: { day: { gte: fromDay, lt: toDay } }, select: { seconds: true } })
        : orm.studyTime.findMany({ where: { day: { gte: fromDay } }, select: { seconds: true } })
      ).then(rows => rows.reduce((n, s) => n + Number(s.seconds), 0))
    return {
      cur: { ...await sum(curSince), seconds: await secondsOf(curDay) },
      prev: { ...await sum(prevSince, curSince), seconds: await secondsOf(prevDay, curDay) },
    }
  }

  /** Ответы по дням для графика отчёта: от `days` дней назад до сегодня (0 — с первого ответа, не больше 120 дней), пустые дни с нулями. */
  async series(source: string, mode: string | undefined, days: number) {
    const where = { source, ...(mode === undefined ? {} : { mode }) }
    const orm = await this.db.orm()
    const firstRow = await orm.answer.findFirst({ where, orderBy: { t: 'asc' }, select: { t: true } })
    const first = firstRow ? Number(firstRow.t) : null
    const span = days || (first ? Math.min(120, Math.max(7, Math.ceil((Date.now() - first) / 86_400_000) + 1)) : 30)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (span - 1))
    const rows = (await orm.answer.findMany({ where: { ...where, t: { gte: BigInt(from.getTime()) } }, select: { t: true, ok: true } })).map(a => ({ ...a, t: Number(a.t) }))
    const byDay = new Map<string, { ok: number; bad: number }>()
    for (const r of rows) {
      const k = dayKeyOf(r.t)
      const d = byDay.get(k) ?? { ok: 0, bad: 0 }
      if (r.ok) d.ok++
      else d.bad++
      byDay.set(k, d)
    }
    const out: { day: string; ok: number; bad: number }[] = []
    for (let i = 0; i < span; i++) {
      const d = new Date(from)
      d.setDate(from.getDate() + i)
      const k = dayKeyOf(d.getTime())
      out.push({ day: k, ...(byDay.get(k) ?? { ok: 0, bad: 0 }) })
    }
    return { source, mode: mode ?? null, days: out }
  }

  /** Сами ответы раздела или режима за период: слово, верно ли, вопрос / верный ответ / что выбрано. Новые сверху, не больше `limit` (300, страница отчёта просит больше).
   * Без `source` (пустая строка) — по всем разделам сразу: так собирается общий «Дневник ошибок». */
  async answersOf(source: string, mode: string | undefined, days: number, only?: 'ok' | 'bad', limit = 300) {
    const where = {
      ...(source ? { source } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(days ? { t: { gte: BigInt(Date.now() - days * 86_400_000) } } : {}),
    }
    const orm = await this.db.orm()
    const count = (ok: number) => orm.answer.count({ where: { ...where, ok } })
    const items = (await orm.answer.findMany({
      where: { ...where, ...(only === 'ok' ? { ok: 1 } : only === 'bad' ? { ok: 0 } : {}) },
      orderBy: [{ t: 'desc' }, { id: 'desc' }], take: limit,
      select: { t: true, word: true, ok: true, detail: true, source: true, mode: true },
    })).map(r => ({ t: Number(r.t), w: r.word, ok: !!r.ok, source: r.source, mode: r.mode, ...(r.detail ? { d: parseDetail(r.detail) } : {}) }))
    const [ok, bad] = await Promise.all([count(1), count(0)])
    return { items, ok, bad }
  }

  /** Баланс монеток и текущая серия верных ответов подряд. */
  async coinState(day = localDay()) {
    await this.gift()
    return { coins: Number(await this.db.getMeta('coins') ?? 0), combo: Number(await this.db.getMeta('combo') ?? 0), ready: await this.readyCount(day) }
  }

  async read() {
    const days: Record<string, number> = {}
    const all: Record<string, number> = {}
    const orm = await this.db.orm()
    for (const r of await orm.day.findMany({ select: { day: true, ok: true, total: true } })) {
      days[r.day] = r.ok
      all[r.day] = r.total
    }
    const time: Record<string, number> = {}
    for (const r of await orm.studyTime.findMany({ select: { day: true, seconds: true } })) time[r.day] = Number(r.seconds)
    const words: Record<string, { ok: number; bad: number; streak: number; last: number; kd?: number }> = {}
    for (const r of await orm.word.findMany()) {
      words[r.word] = { ok: r.ok, bad: r.bad, streak: r.streak, last: Number(r.last), ...(r.kd ? { kd: Number(r.kd) } : {}) }
    }
    const sources: Record<string, { ok: number; bad: number }> = {}
    const sourceRows = await orm.answer.groupBy({ by: ['source'], _sum: { ok: true }, _count: { _all: true } })
    for (const r of sourceRows) {
      const ok = r._sum.ok ?? 0
      sources[r.source] = { ok, bad: r._count._all - ok }
    }
    const log = (await orm.answer.findMany({ orderBy: { id: 'desc' }, take: LOG_LIMIT, select: { t: true, word: true, ok: true, source: true, mode: true, detail: true } }))
      .map(r => ({ t: Number(r.t), w: r.word, ok: !!r.ok, s: r.source, ...(r.mode ? { m: r.mode } : {}), ...(r.detail ? { d: parseDetail(r.detail) } : {}) }))
    return {
      v: 1,
      updated: Number(await this.db.getMeta('updated') ?? 0),
      xp: Number(await this.db.getMeta('xp') ?? 0),
      ...await this.coinState(),
      days,
      all,
      time,
      words,
      sources,
      log,
      moods: await this.json<Record<string, number[]>>('moods', {}),
      profile: await this.json<Profile>('profile', DEFAULT_PROFILE),
      settings: { ...DEFAULT_SETTINGS, ...await this.json<Partial<Settings>>('settings', {}) },
    }
  }

  /** Применяет пачку действий по порядку; если хоть одно неверное, не применяется ничего (400). */
  async apply(body: unknown) {
    const ops = (body as { ops?: unknown })?.ops
    if (!Array.isArray(ops) || ops.length > MAX_OPS) bad('invalid ops')
    let news: string[] = []
    let last0: string | undefined
    await this.db.tx(async () => {
      for (const op of ops as Record<string, unknown>[]) await this.one(op)
      const last = (ops as Record<string, unknown>[]).filter(o => typeof o?.day === 'string' && DAY.test(o.day as string)).pop()
      if (last) {
        last0 = last.day as string
        news = await this.freshRewards(last0)
      }
      await this.db.setMeta('updated', String(Date.now()))
    })
    void pruneImages(this.db) // старая обложка удаляется через час после замены
    return { ok: true, applied: (ops as unknown[]).length, ...await this.coinState(last0), news }
  }

  private async one(op: Record<string, unknown>) {
    switch (op?.type) {
      case 'answer':
        return await this.answer(op)
      case 'round':
        return await this.round(op)
      case 'reset':
        return await this.reset()
      case 'profile':
        return await this.profile(op)
      case 'settings':
        return await this.settings(op)
      case 'time':
        return await this.time(op)
      case 'mood':
        return await this.mood(op)
      case 'import':
        return await this.import(op.data)
      default:
        return bad('unknown op')
    }
  }

  /** Подробности ответа для истории: q — вопрос, a — верный ответ, y — что выбрал, n — как отвечал (способ и что было на экране), r — номер раунда (по нему отчёт делит ответы на занятия); всё необязательно, строки короткие. */
  private detail(v: unknown): string {
    if (v == null) return ''
    if (typeof v !== 'object' || Array.isArray(v)) return bad('invalid op')
    const o = v as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const k of ['q', 'a', 'y']) if (o[k] != null) out[k] = str(o[k], 300)
    if (o.g != null) out.g = str(o.g, 80)
    if (o.n != null) out.n = str(o.n, 600)
    if (o.r != null) out.r = str(o.r, 40)
    return Object.keys(out).length ? JSON.stringify(out) : ''
  }

  /** Один ответ: строка в answers, статистика слова, счётчик дня и очки. */
  private async answer(op: Record<string, unknown>) {
    const t = int(op.t, 0, Number.MAX_SAFE_INTEGER)
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const word = op.word == null ? null : str(op.word, 100)
    const ok = typeof op.ok === 'boolean' ? op.ok : bad('invalid op')
    const source = str(op.source, 20) || bad('invalid op')
    const mode = op.mode == null ? '' : str(op.mode, 30)
    const gain = ok ? (op.xp == null ? 10 : int(op.xp, 0, 1000)) : 0

    const detail = this.detail(op.detail)
    const had = Number(await this.db.getMeta('xp') ?? 0)
    // ошибка отнимает очки, но уровень не падает: ниже начала текущего уровня очки не опускаются
    const active = await this.active()
    const shielded = !ok && active.shield
    if (shielded) await this.setActive({ ...active, shield: false })
    const xp = ok ? gain : shielded ? 0 : -Math.min(COINS.wrongXp, had - xpFor(levelOf(had)))
    const orm = await this.db.orm()
    await orm.answer.create({ data: { t: BigInt(t), word, ok: ok ? 1 : 0, source, mode, xp, detail } })
    await this.coinsForAnswer(t, day, ok, active.double ? 2 : 1)
    if (ok && source === 'review') await this.bump('rev', day)
    if (word) {
      const w = await orm.word.findUnique({ where: { word }, select: { streak: true, kd: true } })
      const streak = Math.max(0, (w?.streak ?? 0) + (ok ? 1 : -1))
      const kd = ok && streak >= KNOWN_STREAK && !w?.kd ? BigInt(t) : (w?.kd ?? null)
      await orm.word.upsert({
        where: { word },
        create: { word, ok: ok ? 1 : 0, bad: ok ? 0 : 1, streak, last: BigInt(t), kd },
        update: { ok: { increment: ok ? 1 : 0 }, bad: { increment: ok ? 0 : 1 }, streak, last: BigInt(t), kd },
      })
    }
    await orm.day.upsert({ where: { day }, create: { day, ok: ok ? 1 : 0, total: 1 }, update: { ok: { increment: ok ? 1 : 0 }, total: { increment: 1 } } })
    if (xp) await this.db.setMeta('xp', String(had + xp))
  }

  /** Записывает в журнал монеток и меняет баланс (ref не даёт начислить дважды). Возвращает false, если такая запись уже была. */
  async coin(t: number, day: string, kind: string, amount: number, reason: string, ref?: string): Promise<boolean> {
    if (!amount) return false
    const orm = await this.db.orm()
    if (ref && await orm.coinLog.findUnique({ where: { ref }, select: { id: true } })) return false
    await orm.coinLog.create({ data: { t: BigInt(t), day, kind, amount, reason, ref: ref ?? null } })
    await this.db.setMeta('coins', String(Number(await this.db.getMeta('coins') ?? 0) + amount))
    return true
  }

  /** Верный ответ: +монетки (до потолка за день) и бонус за серию подряд; ошибка обрывает серию, монетки не отнимает. */
  private async coinsForAnswer(t: number, day: string, ok: boolean, times: number) {
    if (!ok) return await this.db.setMeta('combo', '0')
    const combo = Number(await this.db.getMeta('combo') ?? 0) + 1
    await this.db.setMeta('combo', String(combo))
    if (combo > Number(await this.db.getMeta('maxcombo') ?? 0)) await this.db.setMeta('maxcombo', String(combo))
    const today = (await (await this.db.orm()).coinLog.aggregate({ where: { day, kind: 'answer' }, _sum: { amount: true } }))._sum.amount ?? 0
    await this.coin(t, day, 'answer', Math.max(0, Math.min(COINS.answer, COINS.dayCap - today)) * times, times > 1 ? 'Верный ответ (×2)' : 'Верный ответ')
    const bonus = COINS.combo[combo]
    if (bonus) await this.coin(t, day, 'combo', bonus, `${combo} верных подряд`)
  }

  /** Серия заданий закончена: +монетки один раз (id придумывает сайт, повторная отправка не платит). */
  private async round(op: Record<string, unknown>) {
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const id = str(op.id, 40) || bad('invalid op')
    const size = int(op.size, 0, 1000)
    await this.setActive({ ...await this.active(), double: false }) // «Двойная награда» действует на одну серию
    if (size >= 3 && int(op.right ?? 0, 0, 1000) === size) await this.db.setMeta('flawless_day', day)
    if (size >= 3) await this.coin(int(op.t, 0, Number.MAX_SAFE_INTEGER), day, 'round', COINS.round, 'Серия заданий пройдена', `round:${id}`)
  }

  /** Включённые предметы: защита опыта и двойная награда. */
  async active(): Promise<{ shield: boolean; double: boolean }> {
    const a = await this.json<{ shield?: boolean; double?: boolean }>('active', {})
    return { shield: !!a.shield, double: !!a.double }
  }
  async setActive(a: { shield: boolean; double: boolean }) {
    await this.db.setMeta('active', JSON.stringify(a))
  }

  /** Счётчик «за день» в meta: { day, n }. */
  private async bump(key: string, day: string) {
    const cur = await this.json<{ day: string; n: number }>(key, { day, n: 0 })
    await this.db.setMeta(key, JSON.stringify({ day, n: cur.day === day ? cur.n + 1 : 1 }))
  }
  private async bumped(key: string, day: string) {
    const cur = await this.json<{ day: string; n: number }>(key, { day, n: 0 })
    return cur.day === day ? cur.n : 0
  }

  /** Что выполнено сейчас: достижения, задания дня и недели (для магазина и для выдачи наград). */
  async rewardState(day: string) {
    const orm = await this.db.orm()
    const okCount = await orm.answer.count({ where: { ok: 1 } })
    const grammar = await orm.answer.count({ where: { mode: { in: [...GRAMMAR_MODES] } } })
    const buys = await orm.coinLog.count({ where: { kind: 'buy' } })
    // дней занятий: сколько разных дней были ответы (пропуск ничего не сбрасывает)
    const studyDays = await orm.day.count({ where: { total: { gt: 0 } } })
    const maxCombo = Number(await this.db.getMeta('maxcombo') ?? 0)
    const ach: Record<string, { now: number; goal: number }> = {
      first: { now: okCount, goal: 100 },
      master: { now: okCount, goal: 500 },
      grammar: { now: grammar, goal: 100 },
      flawless: { now: maxCombo, goal: 20 },
      steady: { now: studyDays, goal: 7 },
      collector: { now: buys, goal: 10 },
    }
    const total = (await orm.day.findUnique({ where: { day }, select: { total: true } }))?.total ?? 0
    const daily: Record<string, { now: number; goal: number }> = {
      answers: { now: total, goal: 20 },
      flawless: { now: await this.db.getMeta('flawless_day') === day ? 1 : 0, goal: 1 },
      review: { now: await this.bumped('rev', day), goal: 5 },
    }
    const mon = new Date(day + 'T00:00:00Z')
    mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7))
    const from = mon.toISOString().slice(0, 10)
    mon.setUTCDate(mon.getUTCDate() + 6)
    const week = { from, now: await orm.day.count({ where: { day: { gte: from, lte: mon.toISOString().slice(0, 10) }, total: { gt: 0 } } }), goal: WEEKLY.days }
    return { ach, daily, week }
  }

  /** Все награды с отметками: выполнено (done) и получено (paid). ref уникален и не даёт выплатить дважды. */
  async rewards(day: string) {
    const st = await this.rewardState(day)
    const paid = new Set((await (await this.db.orm()).coinLog.findMany({ where: { OR: [{ ref: { startsWith: 'ach:' } }, { ref: { startsWith: 'task:' } }, { ref: { startsWith: 'week:' } }] }, select: { ref: true } })).flatMap(r => r.ref ? [r.ref] : []))
    const out: { ref: string; kind: string; name: string; coins: number; done: boolean; paid: boolean }[] = []
    const add = (ref: string, kind: string, name: string, coins: number, done: boolean) => out.push({ ref, kind, name, coins, done, paid: paid.has(ref) })
    for (const a of ACHIEVEMENTS) add(`ach:${a.id}`, 'achievement', a.name, a.coins, st.ach[a.id]!.now >= st.ach[a.id]!.goal)
    for (const d of DAILY) add(`task:${d.id}:${day}`, 'task', d.name, d.coins, st.daily[d.id]!.now >= st.daily[d.id]!.goal)
    add(`task:all:${day}`, 'task', 'Все задания дня', DAILY_ALL, DAILY.every(d => st.daily[d.id]!.now >= st.daily[d.id]!.goal))
    add(`week:${st.week.from}`, 'task', WEEKLY.name, WEEKLY.coins, st.week.now >= st.week.goal)
    return out
  }

  /** Сколько наград выполнено, но ещё не получено. */
  async readyCount(day: string) {
    return (await this.rewards(day)).filter(r => r.done && !r.paid).length
  }

  /** Забрать награду кнопкой: только если условие выполнено, и один раз. Возвращает false, если нельзя. */
  async claim(ref: string, day: string): Promise<boolean> {
    const r = (await this.rewards(day)).find(x => x.ref === ref)
    if (!r || !r.done || r.paid) return false
    return await this.coin(Date.now(), day, r.kind, r.coins, r.name, r.ref)
  }

  /** Награды, о которых сайт ещё не сообщал: выполнено и не получено, имя возвращается один раз. */
  async freshRewards(day: string): Promise<string[]> {
    let list: string[] = []
    try {
      list = JSON.parse(await this.db.getMeta('notified') ?? '[]') as string[]
    } catch {
      /* битая запись: начинаем заново */
    }
    const known = new Set(list)
    const fresh = (await this.rewards(day)).filter(r => r.done && !r.paid && !known.has(r.ref))
    if (fresh.length) await this.db.setMeta('notified', JSON.stringify([...known, ...fresh.map(r => r.ref)].slice(-400)))
    return fresh.map(r => r.name)
  }

  /** Подарок при первом запуске: один раз за всё время. */
  private async gift() {
    if (await this.db.getMeta('coin_gift')) return
    await this.db.setMeta('coin_gift', '1')
    const now = new Date()
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    await this.coin(now.getTime(), day, 'gift', COINS.gift, 'Подарок от Юны', 'gift')
  }

  /** Сброс: ответы, слова, дни и очки обнуляются; профиль и настройки остаются. */
  private async reset() {
    const orm = await this.db.orm()
    await orm.answer.deleteMany()
    await orm.word.deleteMany()
    await orm.day.deleteMany()
    await orm.studyTime.deleteMany()
    await this.db.setMeta('xp', '0')
    await this.db.setMeta('combo', '0')
    await this.db.setMeta('maxcombo', '0')
    await this.db.setMeta('moods', '{}')
  }

  /** Секунды занятий за день (таймер на сайте): прибавляются к дню. */
  private async time(op: Record<string, unknown>) {
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const seconds = int(op.seconds, 1, MAX_TIME_OP)
    await (await this.db.orm()).studyTime.upsert({ where: { day }, create: { day, seconds: BigInt(seconds) }, update: { seconds: { increment: BigInt(seconds) } } })
  }

  /** Настроение занятия: «легко / нормально / тяжело» прибавляется к счётчикам дня; хранятся последние MOOD_DAYS дней. */
  private async mood(op: Record<string, unknown>) {
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const i = MOODS.indexOf(op.mood as (typeof MOODS)[number])
    if (i < 0) bad('invalid op')
    const cur = await this.json<Record<string, number[]>>('moods', {})
    const row = cur[day] ?? [0, 0, 0]
    row[i] = Math.min(1000, (row[i] ?? 0) + 1)
    cur[day] = row
    const keep = Object.keys(cur).sort().slice(-MOOD_DAYS)
    await this.db.setMeta('moods', JSON.stringify(Object.fromEntries(keep.map(k => [k, cur[k]]))))
  }

  private async profile(op: Record<string, unknown>) {
    const cur = await this.json<Profile>('profile', DEFAULT_PROFILE)
    if (op.name !== undefined) cur.name = str(op.name, 24)
    if (op.avatar !== undefined) cur.avatar = str(op.avatar, 60_000) || cur.avatar
    if (op.cover !== undefined) {
      const cover = str(op.cover, 40)
      cur.cover = cover === '' || IMAGE_ID.test(cover) ? cover : bad('invalid op')
    }
    await this.db.setMeta('profile', JSON.stringify(cur))
  }

  private async settings(op: Record<string, unknown>) {
    const cur = await this.json<Settings>('settings', DEFAULT_SETTINGS)
    if (op.goal !== undefined) cur.goal = GOALS.includes(op.goal as number) ? (op.goal as number) : bad('invalid goal')
    if (op.cats !== undefined) {
      if (!Array.isArray(op.cats) || op.cats.length > 30) bad('invalid cats')
      cur.cats = (op.cats as unknown[]).map(c => str(c, 40))
    }
    if (op.gameCats !== undefined) {
      const g = op.gameCats as Record<string, unknown> | null
      if (g === null) cur.gameCats = null
      else if (typeof g === 'object' && !Array.isArray(g) && Object.keys(g).length <= 30) {
        cur.gameCats = Object.fromEntries(Object.entries(g).map(([k, v]) => [str(k, 10), int(v, 0, 1)]))
      } else bad('invalid gameCats')
    }
    if (op.marks !== undefined) {
      if (!Array.isArray(op.marks) || op.marks.length > MAX_MARKS) bad('invalid marks')
      const list = (op.marks as unknown[]).map(m => (typeof m === 'string' && MARK.test(m) ? m : bad('invalid marks')))
      cur.marks = [...new Set(list)]
    }
    if (op.keys !== undefined) {
      const k = op.keys as Record<string, unknown> | null
      if (!k || typeof k !== 'object' || Array.isArray(k) || Object.keys(k).length > MAX_KEYS) return bad('invalid keys')
      const entries = Object.entries(k).map(([id, c]) => (KEY_ID.test(id) && typeof c === 'string' && KEY_COMBO.test(c) ? ([id, c] as const) : bad('invalid keys')))
      if (new Set(entries.map(e => e[1])).size !== entries.length) bad('invalid keys')
      cur.keys = Object.fromEntries(entries)
    }
    await this.db.setMeta('settings', JSON.stringify(cur))
  }

  /** Загрузка копии: слова, дни, очки, профиль и настройки заменяются. Журнал ответов и источники из копии не восстанавливаются. */
  private async import(data: unknown) {
    const d = data as Partial<Awaited<ReturnType<ProgressService['read']>>> | null
    if (!d || typeof d !== 'object' || d.v !== 1) bad('invalid import')
    const words = Object.entries(d!.words ?? {})
    const days = Object.entries(d!.days ?? {})
    if (words.length > 5000 || days.length > 5000) bad('invalid import')
    await this.reset()
    for (const [word, w] of words) {
      const s = w as { ok?: number; bad?: number; streak?: number; last?: number; kd?: number }
      await (await this.db.orm()).word.create({ data: { word: str(word, 100), ok: int(s.ok ?? 0, 0, 1e9), bad: int(s.bad ?? 0, 0, 1e9), streak: int(s.streak ?? 0, 0, 1e9), last: BigInt(int(s.last ?? 0, 0, Number.MAX_SAFE_INTEGER)), kd: s.kd ? BigInt(int(s.kd, 0, Number.MAX_SAFE_INTEGER)) : null } })
    }
    for (const [day, ok] of days) {
      if (!DAY.test(day)) bad('invalid import')
      const total = Math.max(Number(d!.all?.[day] ?? 0), Number(ok))
      await (await this.db.orm()).day.create({ data: { day, ok: int(Number(ok), 0, 1e9), total: int(total, 0, 1e9) } })
    }
    for (const [day, sec] of Object.entries(d!.time ?? {})) {
      if (!DAY.test(day)) bad('invalid import')
      await (await this.db.orm()).studyTime.create({ data: { day, seconds: BigInt(int(Number(sec), 0, 1e9)) } })
    }
    await this.db.setMeta('xp', String(int(Number(d!.xp ?? 0), 0, 1e12)))
    const moods = d!.moods && typeof d!.moods === 'object' && !Array.isArray(d!.moods) ? Object.entries(d!.moods as Record<string, unknown>) : []
    if (moods.length > MOOD_DAYS) bad('invalid import')
    await this.db.setMeta(
      'moods',
      JSON.stringify(
        Object.fromEntries(
          moods.map(([day, v]) => {
            if (!DAY.test(day) || !Array.isArray(v)) bad('invalid import')
            return [day, [0, 1, 2].map(i => int(Number((v as unknown[])[i] ?? 0), 0, 1000))]
          }),
        ),
      ),
    )
    if (d!.profile) await this.profile(d!.profile as unknown as Record<string, unknown>)
    if (d!.settings) await this.settings(d!.settings as unknown as Record<string, unknown>)
  }
}
