/**
 * Яндекс.Диск (REST API): хранилище для копий сайта, базы, видео и картинок.
 * Токен в .env: YADISK_TOKEN (права cloud_api:disk.app_folder; пути вида `app:/папка/файл` лежат в «Приложения/<название>»).
 * Корневая папка внутри приложения: YADISK_ROOT (по умолчанию пусто). Без токена `configured()` ложь и ничего не отправляется.
 * Для тестов: YADISK_DUMP_DIR=путь — вместо сети файлы пишутся в эту папку.
 */
import { Injectable } from '@nestjs/common'
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, createWriteStream, rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { DATA_DIR } from '../config.js'

const API = 'https://cloud-api.yandex.net/v1/disk'

/** Три основные папки на Диске (внутри папки приложения). */
export const DISK_DIRS = {
  site: 'Копия сайта',
  db: 'База и env',
  video: 'Видео',
  media: 'Картинки',
} as const

/** Папка копии внутри основной, с датой в конце названия: «Копия сайта/Копия 2026-11-06». */
export const SUB_LABEL: Record<string, string> = { 'Копия сайта': 'Копия', 'База и env': 'База' }
export const datedDir = (base: string, now = new Date()) => `${base}/${SUB_LABEL[base] ?? 'Копия'} ${now.toISOString().slice(0, 10)}`

/** Папки сервера, чьи файлы лежат на Диске одной плоской папкой «Картинки» (имена файлов уникальны: id или ключ с версией). */
export const MEDIA_SOURCES = ['uploads', 'docs', 'public', 'site']

export interface DiskItem {
  name: string
  type: 'file' | 'dir'
  size: number
  modified: string
}

@Injectable()
export class YaDiskService {
  configured() {
    return !!process.env.YADISK_DUMP_DIR || !!process.env.YADISK_TOKEN
  }

  private full(p: string) {
    const root = (process.env.YADISK_ROOT ?? '').replace(/^\/+|\/+$/g, '')
    const clean = p.replace(/^\/+|\/+$/g, '')
    return `app:/${[root, clean].filter(Boolean).join('/')}`
  }

  private async api(method: string, route: string, params: Record<string, string | number | boolean>, timeout = 15_000) {
    const url = `${API}${route}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`
    const res = await fetch(url, { method, headers: { Authorization: `OAuth ${process.env.YADISK_TOKEN}` }, signal: AbortSignal.timeout(timeout) })
    if (res.status === 204) return {} as Record<string, unknown>
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok && res.status !== 409 && res.status !== 404) throw new Error(`yadisk ${res.status}: ${String(body.message ?? body.description ?? 'ошибка')}`)
    return Object.assign(body, { __status: res.status })
  }

  private dump(p: string) {
    return path.join(process.env.YADISK_DUMP_DIR!, p.replace(/^\/+/, ''))
  }

  /** Создаёт папку и все родительские (если уже есть, ничего не делает). */
  async mkdir(dir: string) {
    if (process.env.YADISK_DUMP_DIR) return void mkdirSync(this.dump(dir), { recursive: true })
    const root = (process.env.YADISK_ROOT ?? '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
    const parts = [...root, ...dir.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)]
    let cur = 'app:'
    for (const part of parts) {
      cur += `/${part}`
      const r = (await this.api('PUT', '/resources', { path: cur })) as { __status?: number }
      if (r.__status === 404) throw new Error(`yadisk: не создалась папка ${cur}`) // 409 = уже есть
    }
  }

  /** Загружает файл с диска сервера (потоком, без чтения в память). Существующий перезаписывает. */
  async upload(remote: string, file: string) {
    if (process.env.YADISK_DUMP_DIR) {
      mkdirSync(path.dirname(this.dump(remote)), { recursive: true })
      return void (await pipeline(createReadStream(file), createWriteStream(this.dump(remote))))
    }
    await this.mkdir(path.posix.dirname(remote))
    const link = (await this.api('GET', '/resources/upload', { path: this.full(remote), overwrite: true })) as { href?: string }
    if (!link.href) throw new Error('yadisk: нет ссылки для загрузки')
    const size = statSync(file).size
    const res = await fetch(link.href, {
      method: 'PUT',
      headers: { 'Content-Length': String(size) },
      body: Readable.toWeb(createReadStream(file)) as ReadableStream,
      duplex: 'half',
      signal: AbortSignal.timeout(Math.max(120_000, size / 100_000 * 1000)), // не быстрее ~100 КБ/с
    } as RequestInit)
    if (!res.ok) throw new Error(`yadisk upload ${res.status}`)
  }

  /** Загружает данные из памяти (картинки, небольшие файлы). */
  async put(remote: string, data: Buffer) {
    if (process.env.YADISK_DUMP_DIR) {
      mkdirSync(path.dirname(this.dump(remote)), { recursive: true })
      return void (await import('node:fs/promises').then(f => f.writeFile(this.dump(remote), data)))
    }
    await this.mkdir(path.posix.dirname(remote))
    const link = (await this.api('GET', '/resources/upload', { path: this.full(remote), overwrite: true })) as { href?: string }
    if (!link.href) throw new Error('yadisk: нет ссылки для загрузки')
    const res = await fetch(link.href, { method: 'PUT', body: new Uint8Array(data), signal: AbortSignal.timeout(120_000) })
    if (!res.ok) throw new Error(`yadisk upload ${res.status}`)
  }

  /** Временная ссылка на скачивание (живёт около 30 минут): для видео и больших файлов. */
  async link(remote: string): Promise<string> {
    if (process.env.YADISK_DUMP_DIR) return this.dump(remote)
    const r = (await this.api('GET', '/resources/download', { path: this.full(remote) })) as { href?: string }
    if (!r.href) throw new Error('yadisk: файла нет')
    return r.href
  }

  /** Скачивает файл на диск сервера. */
  async download(remote: string, file: string) {
    mkdirSync(path.dirname(file), { recursive: true })
    if (process.env.YADISK_DUMP_DIR) {
      return void (await pipeline(createReadStream(this.dump(remote)), createWriteStream(file)))
    }
    const res = await fetch(await this.link(remote), { signal: AbortSignal.timeout(600_000) })
    if (!res.ok || !res.body) throw new Error(`yadisk download ${res.status}`)
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file))
  }

  async list(dir: string): Promise<DiskItem[]> {
    if (process.env.YADISK_DUMP_DIR) {
      const d = this.dump(dir)
      if (!existsSync(d)) return []
      return readdirSync(d, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: e.isFile() ? statSync(path.join(d, e.name)).size : 0, modified: statSync(path.join(d, e.name)).mtime.toISOString() }))
    }
    const out: DiskItem[] = []
    for (let offset = 0; ; offset += 200) {
      const r = (await this.api('GET', '/resources', { path: this.full(dir), limit: 200, offset, fields: '_embedded.items.name,_embedded.items.type,_embedded.items.size,_embedded.items.modified' })) as { __status?: number; _embedded?: { items?: DiskItem[] } }
      if (r.__status === 404) return out
      const items = r._embedded?.items ?? []
      out.push(...items.map(i => ({ name: i.name, type: i.type, size: i.size ?? 0, modified: i.modified })))
      if (items.length < 200) return out
    }
  }

  async exists(remote: string) {
    if (process.env.YADISK_DUMP_DIR) return existsSync(this.dump(remote))
    const r = (await this.api('GET', '/resources', { path: this.full(remote), fields: 'name' })) as { __status?: number }
    return r.__status !== 404
  }

  /** Удаляет файл или папку насовсем (минуя корзину). */
  async remove(remote: string) {
    if (process.env.YADISK_DUMP_DIR) return void rmSync(this.dump(remote), { recursive: true, force: true })
    const r = (await this.api('DELETE', '/resources', { path: this.full(remote), permanently: true })) as { __status?: number }
    void r // 404 — файла уже нет
  }

  /** Сколько занято и сколько всего (байты). */
  async space() {
    const r = (await this.api('GET', '', {})) as { total_space?: number; used_space?: number }
    return { total: r.total_space ?? 0, used: r.used_space ?? 0 }
  }

  /* ---------- картинки и файлы: всё одной папкой ---------- */

  /** Копирует файл в папку «Картинки» на Диске в фоне; ошибка только в лог (локальный файл остаётся главным). */
  mirror(file: string) {
    if (!this.configured()) return
    void this.upload(`${DISK_DIRS.media}/${path.basename(file)}`, file).catch(e => console.error('Диск: не загрузился', path.basename(file), (e as Error).message))
  }

  unmirror(file: string) {
    if (!this.configured()) return
    void this.remove(`${DISK_DIRS.media}/${path.basename(file)}`).catch(() => undefined)
  }

  /** Локального файла нет (диск сервера пересоздан): берёт его с Диска. Возвращает, получилось ли. */
  async restore(file: string) {
    if (!this.configured()) return false
    try {
      await this.download(`${DISK_DIRS.media}/${path.basename(file)}`, file)
      return true
    } catch {
      rmSync(file, { force: true })
      return false
    }
  }

  /** Загружает на Диск всё, чего там ещё нет (или размер другой). Для первого переноса и страховки. */
  async syncMedia() {
    const have = new Map((await this.list(DISK_DIRS.media)).map(i => [i.name, i.size]))
    let sent = 0
    let failed = 0
    for (const dir of MEDIA_SOURCES) {
      const d = path.join(DATA_DIR, dir)
      if (!existsSync(d)) continue
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (!e.isFile()) continue
        const f = path.join(d, e.name)
        if (have.get(e.name) === statSync(f).size) continue
        try {
          await this.upload(`${DISK_DIRS.media}/${e.name}`, f)
          sent++
        } catch (err) {
          failed++
          console.error('Диск: не загрузился', e.name, (err as Error).message)
        }
      }
    }
    return { sent, failed, already: have.size }
  }
}
