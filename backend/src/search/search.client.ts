import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { StaticSearchDocument, SearchCategory, SearchResponse, SearchServiceStatus, MeiliTask, PrivateSearchCategory, PrivateSearchResponse, PrivateSearchHit } from './search.types.js'
import type { Db } from '../db/db.service.js'
import { logWarn } from '../log.js'

const INDEX = 'study-materials'
const PRIVATE_INDEX = 'owner-materials'
const CATEGORIES = new Set<SearchCategory>(['word', 'grammar', 'sentence', 'reference', 'letter', 'form', 'game'])
const MAX_DOCUMENTS = 25_000
const MAX_TEXT = 12_000
const MAX_QUERY = 160
const SEARCH_LIMIT = 100
const TASK_WAIT_MS = 30_000

/** Meilisearch document IDs exclude punctuation such as ':'. Encode it losslessly and restore the app ID on reads. */
function encodeDocumentId(id: string) {
  return id.replace(/[^a-zA-Z0-9-]/g, char => `_x${char.codePointAt(0)!.toString(16)}_`)
}

function decodeDocumentId(id: string) {
  return id.replace(/_x([0-9a-f]+)_/gi, (_match, point: string) => String.fromCodePoint(Number.parseInt(point, 16)))
}

export class SearchClient {
  private reindexing = false
  private privateReindexing = false
  private privateReindexQueue: Promise<unknown> = Promise.resolve()
  private privateIndexDirty = false
  private privateIndexTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly db: Db) {}

  private connection() {
    const address = process.env.MEILISEARCH_URL?.trim()
    const key = process.env.MEILISEARCH_MASTER_KEY?.trim()
    if (!address || !key) return null
    try {
      const url = new URL(address)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
      return { url: url.toString().replace(/\/$/, ''), key }
    } catch {
      return null
    }
  }

  private async request<T>(route: string, init: RequestInit = {}, allowStatuses: number[] = []): Promise<T | null> {
    const connection = this.connection()
    if (!connection) throw new ServiceUnavailableException({ error: 'поиск не настроен' })
    let response: Response
    try {
      response = await fetch(`${connection.url}${route}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${connection.key}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(5_000),
      })
    } catch {
      throw new ServiceUnavailableException({ error: 'Meilisearch недоступен' })
    }
    if (allowStatuses.includes(response.status)) return null
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new ServiceUnavailableException({ error: `Meilisearch: HTTP ${response.status}`, detail: body.slice(0, 200) })
    }
    return await response.json() as T
  }

  async status(): Promise<SearchServiceStatus> {
    if (!this.connection()) return { configured: false, available: false, indexed: false, documents: 0, message: 'Meilisearch не настроен' }
    try {
      await this.request<{ status: string }>('/health')
      const stats = await this.request<{ numberOfDocuments?: number }>(`/indexes/${INDEX}/stats`, {}, [404])
      return {
        configured: true,
        available: true,
        indexed: !!stats,
        documents: Number(stats?.numberOfDocuments) || 0,
        message: this.reindexing ? 'идёт переиндексация' : '',
      }
    } catch (error) {
      return {
        configured: true,
        available: false,
        indexed: false,
        documents: 0,
        message: error instanceof Error ? error.message : 'Meilisearch недоступен',
      }
    }
  }

  async search(raw: string, requestedOffset = 0, category?: SearchCategory): Promise<SearchResponse> {
    const offset = Number.isSafeInteger(requestedOffset) ? Math.min(MAX_DOCUMENTS, Math.max(0, requestedOffset)) : 0
    const query = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
    if (this.reindexing) throw new ServiceUnavailableException({ error: 'идёт переиндексация' })
    if (!query) return { query, hits: [], total: 0, limit: SEARCH_LIMIT, offset }
    if (!await this.hasIndex()) throw new ServiceUnavailableException({ error: 'учебный индекс поиска ещё не создан' })
    const result = await this.request<{
      hits?: StaticSearchDocument[]
      estimatedTotalHits?: number
    }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: query, limit: SEARCH_LIMIT, offset, ...(category ? { filter: `category = ${category}` } : {}), attributesToRetrieve: ['id', 'category', 'title', 'text', 'target', 'group'] }),
    })
    const hits = (result?.hits ?? []).map(hit => ({
      id: decodeDocumentId(hit.id),
      category: hit.category,
      title: hit.title,
      text: hit.text,
      ...(hit.target ? { target: hit.target } : {}),
      ...(hit.group ? { group: hit.group } : {}),
    }))
    return { query, hits, total: Math.max(0, Number(result?.estimatedTotalHits) || hits.length), limit: SEARCH_LIMIT, offset }
  }

  async reindex(input: unknown) {
    const documents = this.validate(input)
    if (this.reindexing) throw new ServiceUnavailableException({ error: 'переиндексация уже выполняется' })
    this.reindexing = true
    try {
      await this.ensureIndex()
      await this.task(await this.request<MeiliTask>(`/indexes/${INDEX}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          searchableAttributes: ['title', 'text', 'category', 'group'],
          filterableAttributes: ['category', 'group'],
          displayedAttributes: ['id', 'category', 'title', 'text', 'target', 'group'],
          pagination: { maxTotalHits: MAX_DOCUMENTS },
        }),
      }))
      await this.task(await this.request<MeiliTask>(`/indexes/${INDEX}/documents`, { method: 'DELETE' }))
      if (documents.length) {
        await this.task(await this.request<MeiliTask>(`/indexes/${INDEX}/documents?primaryKey=id`, {
          method: 'POST',
          body: JSON.stringify(documents.map(document => ({ ...document, id: encodeDocumentId(document.id) }))),
        }))
      }
      return { ok: true, documents: documents.length }
    } finally {
      this.reindexing = false
    }
  }

  /** Пересобирает закрытый индекс заметок и галереи из PostgreSQL. */
  reindexPrivate() {
    clearTimeout(this.privateIndexTimer)
    this.privateIndexTimer = undefined
    this.privateIndexDirty = false
    const task = this.privateReindexQueue.then(() => this.performPrivateReindex())
    this.privateReindexQueue = task.catch(() => undefined)
    return task
  }

  /** Объединяет частые обновления заметок и галереи в одну фоновую переиндексацию. */
  schedulePrivateReindex() {
    this.privateIndexDirty = true
    clearTimeout(this.privateIndexTimer)
    this.privateIndexTimer = setTimeout(() => void this.flushPrivateReindex().catch(() => undefined), 1_000)
    this.privateIndexTimer.unref?.()
  }

  private async flushPrivateReindex() {
    if (!this.privateIndexDirty) return
    this.privateIndexDirty = false
    try {
      await this.reindexPrivate()
    } catch (error) {
      this.privateIndexDirty = true
      logWarn('Не удалось обновить личный поисковый индекс:', (error as Error).message)
      throw new ServiceUnavailableException({ error: 'личный поисковый индекс не обновлён' })
    }
  }

  private async performPrivateReindex() {
    this.privateReindexing = true
    try {
      const db = await this.db.orm()
      const [notes, images] = await Promise.all([
        db.note.findMany({ select: { id: true, title: true, text: true, tags: true } }),
        db.image.findMany({ where: { kind: 'gallery' }, select: { id: true, name: true, caption: true, description: true, tags: true } }),
      ])
      const documents = [
        ...notes.map(note => ({ id: `note:${note.id}`, category: 'note', title: note.title, text: [note.title, note.text, note.tags].join(' ') })),
        ...images.map(image => ({ id: `image:${image.id}`, category: 'image', title: image.caption || image.name, text: [image.name, image.caption, image.description, image.tags].join(' ') })),
      ].map(document => ({ ...document, id: encodeDocumentId(document.id) }))
      await this.ensureIndex(PRIVATE_INDEX)
      await this.task(await this.request<MeiliTask>(`/indexes/${PRIVATE_INDEX}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          searchableAttributes: ['title', 'text'],
          filterableAttributes: ['category'],
          displayedAttributes: ['id', 'category'],
        }),
      }))
      await this.task(await this.request<MeiliTask>(`/indexes/${PRIVATE_INDEX}/documents`, { method: 'DELETE' }))
      if (documents.length) {
        await this.task(await this.request<MeiliTask>(`/indexes/${PRIVATE_INDEX}/documents?primaryKey=id`, {
          method: 'POST',
          body: JSON.stringify(documents),
        }))
      }
      return { ok: true, documents: documents.length }
    } finally {
      this.privateReindexing = false
    }
  }

  /** Ищет документы кабинета и возвращает только идентификаторы, без текста заметок и описаний. */
  async searchPrivate(raw: string, category: PrivateSearchCategory): Promise<PrivateSearchResponse> {
    const query = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
    if (!query) return { query, hits: [], total: 0, limit: SEARCH_LIMIT }
    if (this.privateIndexDirty) await this.flushPrivateReindex()
    if (this.privateReindexing) await this.privateReindexQueue
    if (!await this.hasIndex(PRIVATE_INDEX)) await this.reindexPrivate()
    const result = await this.request<{ hits?: PrivateSearchHit[]; estimatedTotalHits?: number }>(`/indexes/${PRIVATE_INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: query, filter: `category = ${category}`, limit: SEARCH_LIMIT, attributesToRetrieve: ['id', 'category'] }),
    })
    const hits = (result?.hits ?? []).filter(hit => hit.category === category).map(hit => ({ id: decodeDocumentId(hit.id), category: hit.category }))
    return { query, hits, total: Math.max(0, Number(result?.estimatedTotalHits) || hits.length), limit: SEARCH_LIMIT }
  }

  private async hasIndex(uid = INDEX) {
    const index = await this.request<{ uid: string }>(`/indexes/${uid}`, {}, [404])
    return !!index
  }

  private async ensureIndex(uid = INDEX) {
    if (await this.hasIndex(uid)) return
    const task = await this.request<MeiliTask>('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid, primaryKey: 'id' }),
    }, [409])
    if (task) await this.task(task)
  }

  private async task(task: MeiliTask | null) {
    if (!task) return
    const end = Date.now() + TASK_WAIT_MS
    let current = task
    // номер берём один раз: в ответе на GET /tasks/N он лежит в поле uid, а не taskUid (из-за этого уходил запрос /tasks/undefined и пересборка падала с HTTP 400)
    const uid = task.taskUid ?? task.uid
    while (current.status !== 'succeeded') {
      if (current.status === 'failed') throw new ServiceUnavailableException({ error: current.error?.message || 'задача Meilisearch завершилась ошибкой' })
      if (Date.now() >= end) throw new ServiceUnavailableException({ error: 'Meilisearch не завершил задачу вовремя' })
      await new Promise(resolve => setTimeout(resolve, 250))
      const next = await this.request<MeiliTask>(`/tasks/${uid}`)
      if (next) current = next
    }
  }

  private validate(input: unknown): StaticSearchDocument[] {
    if (!Array.isArray(input) || input.length > MAX_DOCUMENTS) throw new BadRequestException({ error: `передайте до ${MAX_DOCUMENTS} документов` })
    const ids = new Set<string>()
    return input.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException({ error: `некорректный документ ${index}` })
      const item = value as Record<string, unknown>
      if (typeof item.id !== 'string' || !/^[a-z0-9:_-]{1,100}$/i.test(item.id) || ids.has(item.id)) throw new BadRequestException({ error: `некорректный id документа ${index}` })
      if (typeof item.category !== 'string' || !CATEGORIES.has(item.category as SearchCategory)) throw new BadRequestException({ error: `некорректная категория документа ${index}` })
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 300) throw new BadRequestException({ error: `некорректный заголовок документа ${index}` })
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > MAX_TEXT) throw new BadRequestException({ error: `некорректный текст документа ${index}` })
      if (item.target !== undefined && (typeof item.target !== 'string' || !item.target.startsWith('/') || item.target.startsWith('//') || item.target.length > 300)) throw new BadRequestException({ error: `некорректная ссылка документа ${index}` })
      if (item.group !== undefined && (typeof item.group !== 'string' || item.group.length > 120)) throw new BadRequestException({ error: `некорректная группа документа ${index}` })
      ids.add(item.id)
      return {
        id: item.id,
        category: item.category as SearchCategory,
        title: item.title.trim(),
        text: item.text.trim(),
        ...(typeof item.target === 'string' ? { target: item.target } : {}),
        ...(typeof item.group === 'string' ? { group: item.group } : {}),
      }
    })
  }
}
