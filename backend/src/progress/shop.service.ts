import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { ACHIEVEMENTS, DAILY, DAILY_ALL, ITEM_IDS, ITEMS, SURPRISES, WEEKLY, type ItemId, type SurpriseId } from './coins.js'
import { ProgressService } from './progress.service.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const bad = (m: string): never => {
  throw new BadRequestException(m)
}
const pick = (n: number) => Math.floor(Math.random() * n)

/** Магазин Юны: покупка, инвентарь, использование предметов, сюрпризы, история. Баланс и выдача предмета меняются одной транзакцией. */
@Injectable()
export class ShopService {
  constructor(
    private readonly db: Db,
    private readonly progress: ProgressService,
  ) {}

  private async inv(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await this.db.getMeta('inv') ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  }
  private async setInv(inv: Record<string, number>) {
    await this.db.setMeta('inv', JSON.stringify(inv))
  }
  private day(v: unknown) {
    if (typeof v === 'string' && DAY.test(v)) return v
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** Всё для вкладки «Магазин»: баланс, инвентарь, включённые предметы, задания и достижения. */
  async state(dayRaw?: string) {
    const day = this.day(dayRaw)
    const st = await this.progress.rewardState(day)
    const rw = new Map((await this.progress.rewards(day)).map(r => [r.ref, r]))
    const mark = (ref: string) => ({ ref, ready: !!rw.get(ref)?.done && !rw.get(ref)?.paid, paid: !!rw.get(ref)?.paid })
    return {
      ...await this.progress.coinState(day),
      inv: await this.inv(),
      active: await this.progress.active(),
      daily: DAILY.map(d => ({ ...d, ...st.daily[d.id]!, ...mark(`task:${d.id}:${day}`) })),
      dailyAll: { name: 'Все задания дня', coins: DAILY_ALL, ...mark(`task:all:${day}`) },
      week: { ...WEEKLY, ...st.week, ...mark(`week:${st.week.from}`) },
      ach: ACHIEVEMENTS.map(a => ({ ...a, ...st.ach[a.id]!, ...mark(`ach:${a.id}`) })),
    }
  }

  /** Забрать награду за выполненное задание или достижение. */
  async claim(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const day = this.day(b.day)
    if (typeof b.ref !== 'string' || !await this.progress.claim(b.ref, day)) bad('nothing to claim')
    return await this.state(day)
  }

  /** Покупка предмета или сюрприза. Сюрприз открывается сразу: в ответе `got` (предметы) или `won` (монетки). */
  async buy(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const id = String(b.id ?? '')
    const day = this.day(b.day)
    const now = Date.now()
    let got: Record<string, number> | undefined
    let won: number | undefined
    await this.db.tx(async () => {
      const isItem = (ITEM_IDS as string[]).includes(id)
      const sur = SURPRISES[id as SurpriseId]
      if (!isItem && !sur) return bad('unknown item')
      const price = isItem ? ITEMS[id as ItemId].price : sur.price
      const name = isItem ? ITEMS[id as ItemId].name : sur.name
      const coins = Number(await this.db.getMeta('coins') ?? 0)
      if (coins < price) return bad('not enough coins')
      await this.progress.coin(now, day, 'buy', -price, `Покупка: ${name}`)
      const inv = await this.inv()
      const add = (k: string, n: number) => (inv[k] = (inv[k] ?? 0) + n)
      if (isItem) add(id, 1)
      else if (id === 'hints') add('hint', SURPRISES.hints.count)
      else if (id === 'box') {
        got = {}
        for (let i = 0, n = 3 + pick(3); i < n; i++) {
          const k = ITEM_IDS[pick(ITEM_IDS.length)]!
          got[k] = (got[k] ?? 0) + 1
          add(k, 1)
        }
      } else if (id === 'chest') {
        won = SURPRISES.chest.min + pick(SURPRISES.chest.max - SURPRISES.chest.min + 1)
        await this.progress.coin(now, day, 'chest', won, 'Сундук с монетками')
      }
      await this.setInv(inv)
    })
    return { ...await this.state(day), ...(got ? { got } : {}), ...(won ? { won } : {}) }
  }

  /** Использование предмета: количество уменьшается на единицу, защита и двойная награда включаются. */
  async use(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const id = String(b.id ?? '') as ItemId
    if (!(ITEM_IDS as string[]).includes(id)) bad('unknown item')
    const day = this.day(b.day)
    await this.db.tx(async () => {
      const inv = await this.inv()
      if ((inv[id] ?? 0) < 1) return bad('no such item')
      inv[id]! -= 1
      await this.setInv(inv)
      const a = await this.progress.active()
      if (id === 'shield') {
        if (a.shield) return bad('already active')
        await this.progress.setActive({ ...a, shield: true })
      } else if (id === 'double') {
        if (a.double) return bad('already active')
        await this.progress.setActive({ ...a, double: true })
      }
      // использование без монеток тоже попадает в историю (сумма 0)
      await (await this.db.orm()).coinLog.create({ data: { t: BigInt(Date.now()), day, kind: 'use', amount: 0, reason: `Использовано: ${ITEMS[id].name}` } })
    })
    return await this.state(day)
  }

  /** История операций: новые сверху, можно по типу (earn — все начисления, buy, use, task, achievement). */
  async log(kind?: string, limit = 100) {
    const lim = Math.max(1, Math.min(500, limit | 0 || 100))
    const where = kind === 'earn'
      ? { amount: { gt: 0 }, kind: { notIn: ['task', 'achievement'] } }
      : kind && /^[a-z]+$/.test(kind) ? { kind } : undefined
    return (await (await this.db.orm()).coinLog.findMany({ where, orderBy: { id: 'desc' }, take: lim, select: { t: true, day: true, kind: true, amount: true, reason: true } }))
      .map(row => ({ ...row, t: Number(row.t) }))
  }
}
