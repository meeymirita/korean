/**
 * Отметки «просмотрено» в «Влоге» (`/korean/vlog`): номера видео ютуба хранятся на сервере (`meta.vlog_watched_v1`), чтобы были на всех устройствах владельца.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'

const KEY = 'vlog_watched_v1'
/** Номер видео на ютубе: 11 знаков из латиницы, цифр, «-» и «_». */
export const YT_ID = /^[A-Za-z0-9_-]{11}$/
export const WATCHED_MAX = 500

/** Проверяет присланное: список номеров видео без повторов; лишнего нет. */
export function cleanWatched(body: unknown): string[] {
  const list = (body as { watched?: unknown } | null)?.watched
  if (!Array.isArray(list) || list.length > WATCHED_MAX || list.some(x => typeof x !== 'string' || !YT_ID.test(x))) throw new BadRequestException({ error: 'invalid watched' })
  return [...new Set(list as string[])]
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
}
