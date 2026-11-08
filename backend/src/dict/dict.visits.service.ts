import { Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { dayOf, sourceOf, visitOf, whoIs } from './dict.visits.js'

const KEEP_DAYS = 400
/** Не больше стольких записей в минуту: адрес записи открытый, лишнее отбрасываем, чтобы им нельзя было забить базу. */
const PER_MINUTE = 600

@Injectable()
export class DictVisits {
  constructor(private readonly db: Db) {}

  private window = { at: 0, n: 0 }

  /** Записывает заход (из серверной части сайта и из браузера при переходе внутри словаря). Ничего не бросает наружу. */
  async record(input: { path?: unknown; ua?: unknown; ref?: unknown }, now = Date.now()): Promise<boolean> {
    const visit = visitOf(typeof input.path === 'string' ? input.path.slice(0, 300) : '')
    if (!visit) return false
    if (now - this.window.at > 60_000) this.window = { at: now, n: 0 }
    if (++this.window.n > PER_MINUTE) return false
    const ua = typeof input.ua === 'string' ? input.ua.slice(0, 300) : ''
    const src = typeof input.ref === 'string' ? sourceOf(input.ref.slice(0, 300)) : ''
    const orm = await this.db.orm()
    await orm.dictVisit.create({ data: { t: BigInt(now), day: dayOf(now), kind: visit.kind, ref: visit.ref, who: whoIs(ua), src } })
    if (Math.random() < 0.002) await orm.dictVisit.deleteMany({ where: { day: { lt: dayOf(now - KEEP_DAYS * 86_400_000) } } })
    return true
  }

  /** Итоги за последние дни: сколько заходов людей и роботов, по дням, самые частые страницы, откуда приходят, когда был последний человек. */
  async summary(days = 30, now = Date.now()) {
    const d = Math.min(400, Math.max(1, Math.floor(days) || 30))
    const since = dayOf(now - (d - 1) * 86_400_000)
    const orm = await this.db.orm()
    const where = { day: { gte: since } }
    const [byDay, byKind, byWho, bySrc, top, last] = await Promise.all([
      orm.dictVisit.groupBy({ by: ['day', 'who'], where, _count: { _all: true } }),
      orm.dictVisit.groupBy({ by: ['kind', 'who'], where, _count: { _all: true } }),
      orm.dictVisit.groupBy({ by: ['who'], where, _count: { _all: true } }),
      orm.dictVisit.groupBy({ by: ['src'], where: { ...where, who: 'человек', src: { not: '' } }, _count: { _all: true }, orderBy: { _count: { src: 'desc' } }, take: 15 }),
      orm.dictVisit.groupBy({ by: ['kind', 'ref'], where: { ...where, who: 'человек', kind: { in: ['word', 'set'] } }, _count: { _all: true }, orderBy: { _count: { ref: 'desc' } }, take: 20 }),
      orm.dictVisit.findFirst({ where: { who: 'человек' }, orderBy: { t: 'desc' }, select: { t: true } }),
    ])
    const days_: Record<string, { human: number; bots: number }> = {}
    for (const r of byDay) {
      const x = (days_[r.day] ??= { human: 0, bots: 0 })
      if (r.who === 'человек') x.human += r._count._all
      else x.bots += r._count._all
    }
    const human = byWho.filter(r => r.who === 'человек').reduce((n, r) => n + r._count._all, 0)
    const bots = byWho.filter(r => r.who !== 'человек').reduce((n, r) => n + r._count._all, 0)
    return {
      days: d,
      since,
      human,
      bots,
      /** был ли хоть один человек за период */
      anyHuman: human > 0,
      lastHuman: last ? Number(last.t) : null,
      byDay: Object.entries(days_).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
      byBot: byWho.filter(r => r.who !== 'человек').map(r => ({ who: r.who, n: r._count._all })).sort((a, b) => b.n - a.n),
      byKind: byKind.map(r => ({ kind: r.kind, who: r.who === 'человек' ? 'человек' : 'робот', n: r._count._all })),
      sources: bySrc.map(r => ({ src: r.src, n: r._count._all })),
      top: top.map(r => ({ kind: r.kind, ref: r.ref, n: r._count._all })),
    }
  }
}
