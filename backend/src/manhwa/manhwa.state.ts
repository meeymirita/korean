/**
 * Прогресс чтения манхвы на сервере (`meta.manhwa_v1`): прочитанные главы, страница в каждой главе, статус, закладки и время последнего изменения.
 * Так он одинаков на телефоне, iPad и ноутбуке. Сервер только хранит и проверяет форму; при записи побеждает более свежее состояние манхвы (поле `at`).
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'

export type ManhwaStatus = 'reading' | 'done' | 'want'
export interface ManhwaMark { c: number; p: number; note: string }
export interface ManhwaState {
  read: number[]
  /** глава -> номер страницы (с нуля), на которой остановились */
  pos: Record<string, number>
  /** когда состояние менялось в последний раз (мс); побеждает более позднее */
  at: number
  status?: ManhwaStatus
  /** сколько глав в манхве было при последнем открытии списка глав (для метки «новые главы») */
  seen?: number
  marks: ManhwaMark[]
}

const KEY = 'manhwa_v1'
const PREFS_KEY = 'manhwa_prefs_v1'
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/
export const MAX_MARKS = 200
export const MAX_NOTE = 300
const AT_MAX = 4_100_000_000_000

const int = (v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new BadRequestException({ error: 'invalid manhwa state' })
  return v
}

/** Проверяет и чистит присланное состояние одной манхвы: только числа в пределах, лишние поля отбрасываются. */
export function cleanState(body: unknown): ManhwaState {
  const b = (body ?? {}) as Record<string, unknown>
  if (!Array.isArray(b.read) || b.read.length > 1000 || typeof b.pos !== 'object' || b.pos === null || Array.isArray(b.pos)) throw new BadRequestException({ error: 'invalid manhwa state' })
  const read = [...new Set(b.read.map(n => int(n, 0, 999)))].sort((a, c) => a - c)
  const posIn = Object.entries(b.pos as Record<string, unknown>)
  if (posIn.length > 1000) throw new BadRequestException({ error: 'invalid manhwa state' })
  const pos: Record<string, number> = {}
  for (const [k, v] of posIn) {
    if (!/^\d{1,3}$/.test(k)) throw new BadRequestException({ error: 'invalid manhwa state' })
    pos[k] = int(v, 0, 5000)
  }
  const status: ManhwaStatus | undefined = b.status === 'reading' || b.status === 'done' || b.status === 'want' ? b.status : undefined
  if (b.status !== undefined && b.status !== null && !status) throw new BadRequestException({ error: 'invalid manhwa state' })
  const marksIn = b.marks === undefined ? [] : b.marks
  if (!Array.isArray(marksIn) || marksIn.length > MAX_MARKS) throw new BadRequestException({ error: 'invalid manhwa state' })
  const marks = marksIn.map((m: Record<string, unknown>) => ({
    c: int(m?.c, 0, 999),
    p: int(m?.p, 0, 5000),
    note: typeof m?.note === 'string' ? m.note.slice(0, MAX_NOTE) : '',
  }))
  const seen = b.seen === undefined || b.seen === null ? undefined : int(b.seen, 0, 999)
  return { read, pos, at: int(b.at, 0, AT_MAX), ...(status ? { status } : {}), ...(seen !== undefined ? { seen } : {}), marks }
}

/** Вид читалки и полки (раньше жил только в браузере): ступень масштаба, размытие непрочитанного, порядок полки, две страницы. */
export interface ManhwaPrefs { zoom: number; blur: boolean; sort: 'recent' | 'title'; two: boolean; at: number }

/** Проверяет присланные настройки вида; лишнее отбрасывается. */
export function cleanPrefs(body: unknown): ManhwaPrefs {
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.blur !== 'boolean' || typeof b.two !== 'boolean' || (b.sort !== 'recent' && b.sort !== 'title')) throw new BadRequestException({ error: 'invalid manhwa prefs' })
  return { zoom: int(b.zoom, 0, 20), blur: b.blur, sort: b.sort, two: b.two, at: int(b.at, 0, AT_MAX) }
}

export function cleanSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new BadRequestException({ error: 'invalid manhwa' })
  return slug
}

@Injectable()
export class ManhwaStateService {
  constructor(private readonly db: Db) {}

  /** Записи идут по очереди: два быстрых сохранения не затирают друг друга. */
  private chain: Promise<unknown> = Promise.resolve()

  async all(): Promise<Record<string, ManhwaState>> {
    const raw = await this.db.getMeta(KEY)
    if (!raw) return {}
    try {
      const data = JSON.parse(raw) as Record<string, unknown>
      const out: Record<string, ManhwaState> = {}
      for (const [slug, st] of Object.entries(data)) {
        try {
          out[cleanSlug(slug)] = cleanState(st)
        } catch {
          /* битая запись одной манхвы не мешает остальным */
        }
      }
      return out
    } catch {
      return {}
    }
  }

  /** Настройки вида (одни на все манхвы) или null, если ещё не сохранялись. */
  async prefs(): Promise<ManhwaPrefs | null> {
    const raw = await this.db.getMeta(PREFS_KEY)
    if (!raw) return null
    try {
      return cleanPrefs(JSON.parse(raw))
    } catch {
      return null
    }
  }

  /** Сохраняет настройки вида, если они не старее сохранённых; возвращает то, что теперь хранится. */
  savePrefs(body: unknown): Promise<ManhwaPrefs> {
    const p = cleanPrefs(body)
    const run = async () => {
      const old = await this.prefs()
      if (old && old.at > p.at) return old
      await this.db.setMeta(PREFS_KEY, JSON.stringify(p))
      return p
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }

  /** Сохраняет состояние манхвы, если оно не старее сохранённого; возвращает то, что теперь хранится (клиент берёт его). */
  save(slug: string, body: unknown): Promise<ManhwaState> {
    const s = cleanSlug(slug)
    const state = cleanState(body)
    const run = async () => {
      const all = await this.all()
      const old = all[s]
      if (old && old.at > state.at) return old
      all[s] = state
      await this.db.setMeta(KEY, JSON.stringify(all))
      return state
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }
}
