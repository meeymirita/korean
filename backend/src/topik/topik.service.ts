/**
 * «Прогноз TOPIK I» (`/korean/topik`): результаты теста слов и пробников хранятся на сервере (`meta.topik_v1`), чтобы были на всех устройствах владельца.
 * Сервер только хранит и проверяет форму; расчёт баллов делает сайт (`frontend/src/data/korean/topik.ts`).
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'

export interface TopikTest { at: number; n: number; correct: number; wrong: number }
export interface TopikMock { at: number; l: number | null; r: number; src: 'site' | 'real'; n: number }
export interface TopikData { tests: TopikTest[]; mocks: TopikMock[] }

const KEY = 'topik_v1'
/** Сколько записей каждого вида держим: старые отбрасываются. */
export const TOPIK_KEEP = 50

const int = (v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new BadRequestException({ error: 'invalid topik' })
  return v
}
const AT_MIN = 1_600_000_000_000
const AT_MAX = 4_100_000_000_000

/** Проверяет и чистит присланное: только числа в пределах, лишние поля отбрасываются. */
export function cleanTopik(body: unknown): TopikData {
  const b = (body ?? {}) as { tests?: unknown; mocks?: unknown }
  if (!Array.isArray(b.tests) || !Array.isArray(b.mocks) || b.tests.length > TOPIK_KEEP * 2 || b.mocks.length > TOPIK_KEEP * 2) throw new BadRequestException({ error: 'invalid topik' })
  const tests = b.tests.slice(-TOPIK_KEEP).map((t: Record<string, unknown>) => {
    const n = int(t?.n, 1, 200)
    return { at: int(t?.at, AT_MIN, AT_MAX), n, correct: int(t?.correct, 0, n), wrong: int(t?.wrong, 0, n) }
  })
  if (tests.some(t => t.correct + t.wrong > t.n)) throw new BadRequestException({ error: 'invalid topik' })
  const mocks: TopikMock[] = b.mocks.slice(-TOPIK_KEEP).map((m: Record<string, unknown>): TopikMock => {
    const src = m?.src === 'site' || m?.src === 'real' ? m.src : null
    if (!src) throw new BadRequestException({ error: 'invalid topik' })
    return { at: int(m?.at, AT_MIN, AT_MAX), l: m?.l === null ? null : int(m?.l, 0, 100), r: int(m?.r, 0, 100), src, n: int(m?.n ?? 0, 0, 200) }
  })
  return { tests, mocks }
}

@Injectable()
export class TopikService {
  constructor(private readonly db: Db) {}

  async get(): Promise<TopikData> {
    const raw = await this.db.getMeta(KEY)
    if (!raw) return { tests: [], mocks: [] }
    try {
      return cleanTopik(JSON.parse(raw))
    } catch {
      return { tests: [], mocks: [] }
    }
  }

  async set(body: unknown): Promise<TopikData> {
    const data = cleanTopik(body)
    await this.db.setMeta(KEY, JSON.stringify(data))
    return data
  }
}
