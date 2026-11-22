/**
 * Отметки «просмотрено» в «Влоге» (`/korean/vlog`): номера видео ютуба хранятся на сервере (`meta.vlog_watched_v1`), чтобы были на всех устройствах владельца.
 * Попытки теста по влогу (`meta.vlog_tests_v1`): дата, общий балл, баллы по блокам, «сдано»; список неверных вопросов не хранится.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'

const KEY = 'vlog_watched_v1'
const TESTS_KEY = 'vlog_tests_v1'
/** Проходной балл теста по влогу (как `PASS` на сайте): сдано считает сервер, а не присланное. */
export const TEST_PASS = 0.8
export const TESTS_MAX = 300
/** Номер видео на ютубе: 11 знаков из латиницы, цифр, «-» и «_». */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/
export const WATCHED_MAX = 500

/** Проверяет присланное: список номеров видео без повторов; лишнего нет. */
export function cleanWatched(body: unknown): string[] {
  const list = (body as { watched?: unknown } | null)?.watched
  if (!Array.isArray(list) || list.length > WATCHED_MAX || list.some(x => typeof x !== 'string' || !YT_ID.test(x))) throw new BadRequestException({ error: 'invalid watched' })
  return [...new Set(list as string[])]
}

export interface VlogTestAttempt {
  yt: string
  /** время попытки, мс (ставит сервер) */
  at: number
  score: number
  total: number
  passed: boolean
  blocks: { id: string; score: number; total: number }[]
}

const int = (x: unknown, max = 1000): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max

/** Проверяет присланную попытку; `at` и `passed` считаются здесь, присланные не берутся. */
export function cleanAttempt(body: unknown, now = Date.now()): VlogTestAttempt {
  const b = (body ?? {}) as Record<string, unknown>
  const blocks = b.blocks
  const ok =
    typeof b.yt === 'string' && YT_ID.test(b.yt) && int(b.score) && int(b.total) && b.total >= 1 && b.score <= b.total &&
    Array.isArray(blocks) && blocks.length >= 1 && blocks.length <= 8 &&
    blocks.every(x => x && typeof x.id === 'string' && /^[a-z]{1,20}$/.test(x.id) && int(x.score) && int(x.total) && x.score <= x.total)
  if (!ok) throw new BadRequestException({ error: 'invalid attempt' })
  const list = blocks as { id: string; score: number; total: number }[]
  const score = b.score as number
  const total = b.total as number
  return { yt: b.yt as string, at: now, score, total, passed: score / total >= TEST_PASS, blocks: list.map(x => ({ id: x.id, score: x.score, total: x.total })) }
}

@Injectable()
export class VlogService {
  constructor(private readonly db: Db) {}

  async get(): Promise<{ watched: string[] }> {
    const raw = await this.db.getMeta(KEY)
    if (!raw) return { watched: [] }
    try {
      return { watched: cleanWatched(JSON.parse(raw)) }
    } catch {
      return { watched: [] }
    }
  }

  async set(body: unknown): Promise<{ watched: string[] }> {
    const watched = cleanWatched(body)
    await this.db.setMeta(KEY, JSON.stringify({ watched }))
    return { watched }
  }

  async tests(): Promise<{ attempts: VlogTestAttempt[] }> {
    const raw = await this.db.getMeta(TESTS_KEY)
    if (!raw) return { attempts: [] }
    try {
      const list = (JSON.parse(raw) as { attempts?: unknown[] }).attempts ?? []
      return { attempts: list.flatMap(a => { try { return [cleanAttempt(a, (a as { at?: number }).at)] } catch { return [] } }) }
    } catch {
      return { attempts: [] }
    }
  }

  async addTest(body: unknown): Promise<{ attempts: VlogTestAttempt[] }> {
    const attempt = cleanAttempt(body)
    const attempts = [...(await this.tests()).attempts, attempt].slice(-TESTS_MAX)
    await this.db.setMeta(TESTS_KEY, JSON.stringify({ attempts }))
    return { attempts }
  }
}
