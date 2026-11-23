import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '../config.js'

/**
 * Кэш картинок манхвы на диске сервера (`data/manhwa-cache/<манхва>/<глава>/<файл>`): первый запрос берёт файл у Яндекс.Диска и оставляет у себя,
 * дальше страницы и обложки отдаются сразу, без ссылок Диска и без его лимитов (из-за них у обложек глав бывали 404).
 * Размер ограничен (`MANHWA_CACHE_MB`, по умолчанию 3000): когда кэш разрастается, удаляются самые давние по обращению файлы.
 */
export const CACHE_DIR = path.join(DATA_DIR, 'manhwa-cache')
const MAX_FILE = 12 * 1024 * 1024
const LIMIT = Number(process.env.MANHWA_CACHE_MB || 3000) * 1024 * 1024

const inflight = new Map<string, Promise<string | null>>()
let writes = 0

export const cachePath = (key: string) => path.join(CACHE_DIR, key)

/** Файл из кэша или `null`; обращение отмечается (для вытеснения самых давних). */
export function cacheGet(key: string): string | null {
  const f = cachePath(key)
  if (!existsSync(f)) return null
  try {
    const now = new Date()
    utimesSync(f, now, now)
  } catch {
    /* отметка времени не обязательна */
  }
  return f
}

/** Скачивает файл по ссылке в кэш (один раз, даже если просят сразу много); `null`, если не вышло, тогда вызывающий отдаёт перенаправление. */
export function cacheFill(key: string, url: () => Promise<string>): Promise<string | null> {
  const hit = cacheGet(key)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(key)
  if (pending) return pending
  const job = (async () => {
    try {
      const res = await fetch(await url(), { signal: AbortSignal.timeout(60_000) })
      if (!res.ok) return null
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > MAX_FILE) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0 || buf.length > MAX_FILE) return null
      const f = cachePath(key)
      mkdirSync(path.dirname(f), { recursive: true })
      const tmp = `${f}.${process.pid}.tmp`
      writeFileSync(tmp, buf)
      renameSync(tmp, f)
      if (++writes % 40 === 0) trim()
      return f
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, job)
  return job
}

/** Убрать файл из кэша (картинку заменили или удалили). */
export function cacheDrop(key: string) {
  rmSync(cachePath(key), { force: true })
}

/** Если кэш больше предела, удаляет файлы, к которым давно не обращались, пока не уложится в 85% предела. */
export function trim() {
  try {
    const files: { f: string; size: number; at: number }[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name)
        if (e.isDirectory()) walk(f)
        else if (!e.name.endsWith('.tmp')) {
          const s = statSync(f)
          files.push({ f, size: s.size, at: s.mtimeMs })
        }
      }
    }
    if (!existsSync(CACHE_DIR)) return
    walk(CACHE_DIR)
    let total = files.reduce((n, x) => n + x.size, 0)
    if (total <= LIMIT) return
    files.sort((a, b) => a.at - b.at)
    for (const x of files) {
      if (total <= LIMIT * 0.85) break
      rmSync(x.f, { force: true })
      total -= x.size
    }
  } catch {
    /* кэш вспомогательный: сбой чистки не должен ронять запрос */
  }
}
