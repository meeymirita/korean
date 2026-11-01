import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service'
import { ACHIEVEMENTS, DAILY, DAILY_ALL, ITEM_IDS, ITEMS, SURPRISES, WEEKLY, type ItemId, type SurpriseId } from './coins'
import { ProgressService } from './progress.service'

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

  private inv(): Record<string, number> {
    try {
      return JSON.parse(this.db.getMeta('inv') ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  }
  private setInv(inv: Record<string, number>) {
    this.db.setMeta('inv', JSON.stringify(inv))
  }
  private day(v: unknown) {
    if (typeof v === 'string' && DAY.test(v)) return v
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /** Всё для вкладки «Магазин»: баланс, инвентарь, включённые предметы, задания и достижения. */
  state(dayRaw?: string) {
    const day = this.day(dayRaw)
    const st = this.progress.rewardState(day)
    const rw = new Map(this.progress.rewards(day).map(r => [r.ref, r]))
    const mark = (ref: string) => ({ ref, ready: !!rw.get(ref)?.done && !rw.get(ref)?.paid, paid: !!rw.get(ref)?.paid })
    return {
      ...this.progress.coinState(day),
      inv: this.inv(),
      active: this.progress.active(),
      daily: DAILY.map(d => ({ ...d, ...st.daily[d.id]!, ...mark(`task:${d.id}:${day}`) })),
      dailyAll: { name: 'Все задания дня', coins: DAILY_ALL, ...mark(`task:all:${day}`) },
      week: { ...WEEKLY, ...st.week, ...mark(`week:${st.week.from}`) },
      ach: ACHIEVEMENTS.map(a => ({ ...a, ...st.ach[a.id]!, ...mark(`ach:${a.id}`) })),
    }
  }

  /** Забрать награду за выполненное задание или достижение. */
  claim(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const day = this.day(b.day)
    if (typeof b.ref !== 'string' || !this.progress.claim(b.ref, day)) bad('nothing to claim')
    return this.state(day)
  }

  /** Покупка предмета или сюрприза. Сюрприз открывается сразу: в ответе `got` (предметы) или `won` (монетки). */
  buy(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const id = String(b.id ?? '')
    const day = this.day(b.day)
    const now = Date.now()
    let got: Record<string, number> | undefined
    let won: number | undefined
    this.db.tx(() => {
      const isItem = (ITEM_IDS as string[]).includes(id)
      const sur = SURPRISES[id as SurpriseId]
      if (!isItem && !sur) return bad('unknown item')
      const price = isItem ? ITEMS[id as ItemId].price : sur.price
      const name = isItem ? ITEMS[id as ItemId].name : sur.name
      const coins = Number(this.db.getMeta('coins') ?? 0)
      if (coins < price) return bad('not enough coins')
      this.progress.coin(now, day, 'buy', -price, `Покупка: ${name}`)
      const inv = this.inv()
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
        this.progress.coin(now, day, 'chest', won, 'Сундук с монетками')
      }
      this.setInv(inv)
    })
    return { ...this.state(day), ...(got ? { got } : {}), ...(won ? { won } : {}) }
  }

  /** Использование предмета: количество уменьшается на единицу, защита и двойная награда включаются. */
  use(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>
    const id = String(b.id ?? '') as ItemId
    if (!(ITEM_IDS as string[]).includes(id)) bad('unknown item')
    const day = this.day(b.day)
    this.db.tx(() => {
      const inv = this.inv()
      if ((inv[id] ?? 0) < 1) return bad('no such item')
      inv[id]! -= 1
      this.setInv(inv)
      const a = this.progress.active()
      if (id === 'shield') {
        if (a.shield) return bad('already active')
        this.progress.setActive({ ...a, shield: true })
      } else if (id === 'double') {
        if (a.double) return bad('already active')
        this.progress.setActive({ ...a, double: true })
      }
      // использование без монеток тоже попадает в историю (сумма 0)
      this.db.run('INSERT INTO coin_log (t, day, kind, amount, reason) VALUES (?, ?, ?, 0, ?)', Date.now(), day, 'use', `Использовано: ${ITEMS[id].name}`)
    })
    return this.state(day)
  }

  /** История операций: новые сверху, можно по типу (earn — все начисления, buy, use, task, achievement). */
  log(kind?: string, limit = 100) {
    const lim = Math.max(1, Math.min(500, limit | 0 || 100))
    const where =
      kind === 'earn' ? "WHERE amount > 0 AND kind NOT IN ('task', 'achievement')" : kind && /^[a-z]+$/.test(kind) ? 'WHERE kind = ?' : ''
    const args = kind && kind !== 'earn' && /^[a-z]+$/.test(kind) ? [kind] : []
    return this.db.all<{ t: number; day: string; kind: string; amount: number; reason: string }>(`SELECT t, day, kind, amount, reason FROM coin_log ${where} ORDER BY id DESC LIMIT ${lim}`, ...args)
  }
}
