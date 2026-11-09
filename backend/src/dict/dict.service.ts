import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common'
import { access, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildDocs, type DictDoc, type RawEntry } from './dict.data.js'
import { dictionaryForms, isPredicate } from './dict.hangul.js'
import { COLLECTIONS, collectionBySlug } from './dict.collections.js'

const INDEX = 'krdict'
const BATCH = 4000
const LIMIT = 20
const MAX_QUERY = 120
const TASK_WAIT_MS = 5 * 60_000
const LEVELS = ['начальный', 'средний', 'высокий', 'нет']

export interface DictHit extends Omit<DictDoc, 'senses' | 'def' | 'ru'> {
  ru: string
  /** первые значения с одним примером; остальное на странице слова */
  senses: { ko: string; ru: { t: string; d: string }[]; sent: string[] }[]
  moreSenses: number
}

export interface DictSearchResult {
  query: string
  hits: DictHit[]
  total: number
  limit: number
  offset: number
  /** слово набрано в спряжении: «먹었어요» → ищем 먹다; hits уже содержат найденные словарные формы первыми */
  via?: { typed: string; forms: string[] }
  /** сколько слов в каждом уровне и части речи по запросу (для кнопок-фильтров) */
  facets: { level: Record<string, number>; pos: Record<string, number> }
}

/** Файл словаря: переменная DICT_FILE, по умолчанию krdict_ko_ru.json рядом с данными сервера. */
export const dictFile = () => process.env.DICT_FILE?.trim() || path.join(process.env.DATA_DIR || process.cwd(), 'krdict_ko_ru.json')

interface MeiliSearch { hits?: DictDoc[]; estimatedTotalHits?: number; facetDistribution?: { level?: Record<string, number>; pos?: Record<string, number> } }

const SHOWN_SENSES = 4

/** Для выдачи поиска: лишнее (все примеры, определения) не отправляем, подробности на странице слова. */
function slim(d: DictDoc): DictHit {
  const { def: _def, senses, ...rest } = d
  return {
    ...rest,
    senses: senses.slice(0, SHOWN_SENSES).map(s => ({ ko: s.ko, ru: s.ru, sent: s.sent.slice(0, 1) })),
    moreSenses: Math.max(0, senses.length - SHOWN_SENSES),
  }
}

/** Пометка «индекс собран целиком» рядом с файлом словаря: размер и время файла и число документов. Без неё недостроенный индекс (сервер перезапустили на середине) считался бы готовым. */
/** Версия формата документов и настроек индекса: поменял поля или настройки в dict.data.ts / reindex, подними число, и при следующем старте индекс соберётся заново. */
export const INDEX_VERSION = 3
export interface IndexMark { size: number; mtimeMs: number; documents: number; version?: number }
export const markFile = (file: string) => file + '.indexed'
export const isIndexFresh = (mark: IndexMark | null, file: { size: number; mtimeMs: number }, documents: number) =>
  !!mark && mark.version === INDEX_VERSION && mark.size === file.size && mark.mtimeMs === file.mtimeMs && mark.documents === documents && documents > 0

/** Перевод для списка: до двух разных переводов, длинные описания и повторы отбрасываются. */
export const shortRu = (ru: string, max = 2) => {
  const all = [...new Set(ru.split('; ').map(x => x.trim()).filter(Boolean))]
  const short = all.filter(x => x.length <= 40)
  return (short.length ? short : all).slice(0, max).join('; ')
}

const q1 = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

@Injectable()
export class DictService implements OnApplicationBootstrap {
  private indexing = false
  private readonly log = new Logger('Dict')

  /** Файл словаря лежит на сервере, а индекса ещё нет (первый запуск, чистый Meilisearch): собираем его в фоне, запуск сервера не ждёт. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return
    void (async () => {
      try {
        if (!this.conn()) return
        await access(dictFile())
        const [info, st] = await Promise.all([stat(dictFile()), this.status()])
        const mark = await readFile(markFile(dictFile()), 'utf8').then(t => JSON.parse(t) as IndexMark).catch(() => null)
        if (st.indexed && isIndexFresh(mark, info, st.documents)) return
        console.log('Словарь: индекс не готов, строю заново из ' + dictFile()) // Nest Logger.log у нас выключен (main.ts: только error и warn), поэтому console
        const r = await this.reindex()
        console.log(`Словарь проиндексирован: ${r.documents} слов`)
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') this.log.warn('Не удалось проиндексировать словарь: ' + ((e as Error).message || e))
      }
    })()
  }

  private conn() {
    const address = process.env.MEILISEARCH_URL?.trim()
    const key = process.env.MEILISEARCH_MASTER_KEY?.trim()
    if (!address || !key) return null
    return { url: address.replace(/\/$/, ''), key }
  }

  private async req<T>(route: string, init: RequestInit = {}, allow: number[] = [], timeout = 8_000): Promise<T | null> {
    const c = this.conn()
    if (!c) throw new ServiceUnavailableException({ error: 'поиск не настроен' })
    let res: Response
    try {
      res = await fetch(`${c.url}${route}`, {
        ...init,
        headers: { Authorization: `Bearer ${c.key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
        signal: AbortSignal.timeout(timeout),
      })
    } catch {
      throw new ServiceUnavailableException({ error: 'Meilisearch недоступен' })
    }
    if (allow.includes(res.status)) return null
    if (!res.ok) throw new ServiceUnavailableException({ error: `Meilisearch: HTTP ${res.status}`, detail: (await res.text().catch(() => '')).slice(0, 200) })
    return (await res.json()) as T
  }

  private async wait(task: { taskUid?: number; uid?: number } | null) {
    if (!task) return
    const id = task.taskUid ?? task.uid
    const end = Date.now() + TASK_WAIT_MS
    for (;;) {
      const t = await this.req<{ status: string; error?: { message?: string } }>(`/tasks/${id}`)
      if (t?.status === 'succeeded') return
      if (t?.status === 'failed') throw new ServiceUnavailableException({ error: t.error?.message || 'задача Meilisearch не удалась' })
      if (Date.now() > end) throw new ServiceUnavailableException({ error: 'Meilisearch не успел обработать словарь' })
      await new Promise(r => setTimeout(r, 400))
    }
  }

  private sitemapCache: { at: number; urls: { loc: string }[] } | null = null
  private sitemapLoading: Promise<{ loc: string }[]> | null = null

  /** Все слова словаря для карты сайта (sitemap.xml): адреса `/dict/<слово>`, по одному на слово (омонимы сливаются). Кэш на 6 часов. */
  async sitemap(): Promise<{ loc: string }[]> {
    this.notWhileIndexing()
    const TTL = 6 * 60 * 60_000
    if (this.sitemapCache && Date.now() - this.sitemapCache.at < TTL) return this.sitemapCache.urls
    if (this.sitemapLoading) return this.sitemapLoading
    this.sitemapLoading = (async () => {
      const words = new Set<string>()
      for (let offset = 0; ; offset += 1000) {
        const page = await this.req<{ results?: { word: string }[]; total?: number }>(`/indexes/${INDEX}/documents?fields=word&limit=1000&offset=${offset}`, {}, [404], 20_000)
        const rows = page?.results ?? []
        for (const r of rows) if (r.word && !/[\s/?#%]/.test(r.word)) words.add(r.word)
        if (rows.length < 1000) break
      }
      const urls = [
        { loc: '/dict/podborki' },
        ...COLLECTIONS.map(c => ({ loc: `/dict/podborki/${c.slug}` })),
        ...[...words].sort().map(w => ({ loc: `/dict/${w}` })),
      ]
      if (urls.length && !this.indexing) this.sitemapCache = { at: Date.now(), urls }
      return urls
    })().finally(() => { this.sitemapLoading = null })
    return this.sitemapLoading
  }

  async status() {
    if (!this.conn()) return { configured: false, indexed: false, documents: 0, indexing: this.indexing }
    const s = await this.req<{ numberOfDocuments?: number }>(`/indexes/${INDEX}/stats`, {}, [404])
    return { configured: true, indexed: !!s, documents: Number(s?.numberOfDocuments) || 0, indexing: this.indexing }
  }

  /** Читает krdict_ko_ru.json и полностью пересобирает индекс. Файл на сервер кладут вручную (в git его нет: вес и лицензия). */
  async reindex(file = dictFile()) {
    if (this.indexing) throw new BadRequestException({ error: 'индексация уже идёт' })
    let raw: string
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      throw new NotFoundException({ error: `нет файла словаря: ${file}` })
    }
    const parsed = JSON.parse(raw) as { entries?: RawEntry[] }
    if (!Array.isArray(parsed.entries)) throw new BadRequestException({ error: 'в файле нет списка entries' })
    const docs = buildDocs(parsed.entries)
    this.indexing = true
    this.clearCaches()
    await unlink(markFile(file)).catch(() => undefined) // пока идёт сборка, индекс считается неготовым
    try {
      if (!(await this.req(`/indexes/${INDEX}`, {}, [404]))) {
        await this.wait(await this.req('/indexes', { method: 'POST', body: JSON.stringify({ uid: INDEX, primaryKey: 'id' }) }, [409]))
      }
      await this.wait(await this.req(`/indexes/${INDEX}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          searchableAttributes: ['word', 'forms', 'ru', 'def'],
          filterableAttributes: ['word', 'level', 'pos', 'posKo', 'tr', 'cat', 'freq'],
          sortableAttributes: ['levelRank', 'rank', 'hom', 'wordLen', 'word', 'freq'],
          rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'rank:desc', 'wordLen:asc', 'hom:asc'],
          pagination: { maxTotalHits: 60000 },
          typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
        }),
      }, [], 30_000))
      await this.wait(await this.req(`/indexes/${INDEX}/documents`, { method: 'DELETE' }))
      for (let i = 0; i < docs.length; i += BATCH) {
        await this.wait(await this.req(`/indexes/${INDEX}/documents?primaryKey=id`, { method: 'POST', body: JSON.stringify(docs.slice(i, i + BATCH)) }, [], 120_000))
      }
      const info = await stat(file)
      await writeFile(markFile(file), JSON.stringify({ size: info.size, mtimeMs: info.mtimeMs, documents: docs.length, version: INDEX_VERSION } satisfies IndexMark)).catch(() => undefined)
      return { ok: true, documents: docs.length, entries: parsed.entries.length }
    } finally {
      this.indexing = false
      this.clearCaches() // всё, что успели запомнить на неполном индексе (карта сайта, папки, подборки), выбрасываем
    }
  }

  /** Сбрасывает запомненные ответы: карту сайта, папки, подборки. */
  private clearCaches() {
    this.sitemapCache = null
    this.foldersCache = null
    this.collectionCache.clear()
  }

  /** Пока идёт сборка индекса, в нём только часть слов: такие ответы не отдаём и не запоминаем. */
  private notWhileIndexing() {
    if (this.indexing) throw new ServiceUnavailableException({ error: 'словарь сейчас индексируется' })
  }

  async search(raw: string, opts: { level?: string; pos?: string; offset?: number } = {}): Promise<DictSearchResult> {
    const query = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
    const offset = Number.isSafeInteger(opts.offset) ? Math.min(1980, Math.max(0, opts.offset!)) : 0
    const empty: DictSearchResult = { query, hits: [], total: 0, limit: LIMIT, offset, facets: { level: {}, pos: {} } }
    if (!query) return empty
    if (this.indexing) throw new ServiceUnavailableException({ error: 'словарь сейчас индексируется' })
    const filters: string[] = []
    if (opts.level && LEVELS.includes(opts.level)) filters.push(`level = ${q1(opts.level)}`)
    if (opts.pos) filters.push(`pos = ${q1(opts.pos.slice(0, 40))}`)
    const filter = filters.join(' AND ') || undefined
    const body = { q: query, limit: LIMIT, offset, filter, facets: ['level', 'pos'], matchingStrategy: 'all' }
    const [main, via, top] = await Promise.all([
      this.req<MeiliSearch>(`/indexes/${INDEX}/search`, { method: 'POST', body: JSON.stringify(body) }, [404]),
      this.viaForms(query, filter),
      offset === 0 ? this.topMatches(query, filter) : Promise.resolve([] as DictDoc[]),
    ])
    if (!main) throw new ServiceUnavailableException({ error: 'словарь ещё не проиндексирован' })
    let hits = main.hits ?? []
    // «красивая девушка»: нет слова, где есть обе части: ищем хотя бы по первой, а не отвечаем «ничего»
    if (!hits.length && !via.length && query.includes(' ')) {
      const loose = await this.req<MeiliSearch>(`/indexes/${INDEX}/search`, { method: 'POST', body: JSON.stringify({ ...body, matchingStrategy: 'last' }) })
      if (loose?.hits?.length) { Object.assign(main, loose); hits = loose.hits }
    }
    let total = Math.max(0, Number(main.estimatedTotalHits) || hits.length)
    // слова, у которых запрос совпадает целиком с самим словом или с одним из переводов («школа» → 학교), идут первыми, самые употребимые выше
    if (top.length) {
      const ids = new Set(top.map(h => h.id))
      hits = [...top, ...hits.filter(h => !ids.has(h.id))].slice(0, LIMIT)
      total = Math.max(total, hits.length)
    }
    let info: DictSearchResult['via']
    // слово и так есть в словаре в таком виде (비빔, 학생): догадки о спряжении не нужны
    const exact = hits.some(h => h.word === query)
    if (via.length && offset === 0 && !exact) {
      const ids = new Set(via.map(h => h.id))
      hits = [...via, ...hits.filter(h => !ids.has(h.id))].slice(0, LIMIT)
      total = Math.max(total, hits.length)
      info = { typed: query, forms: [...new Set(via.map(h => h.word))] }
    }
    return { query, hits: hits.map(slim), total, limit: LIMIT, offset, ...(info ? { via: info } : {}), facets: { level: main.facetDistribution?.level ?? {}, pos: main.facetDistribution?.pos ?? {} } }
  }

  /** Слова, где запрос это ровно слово или ровно один из переводов, по убыванию «популярности». Не больше 8. */
  private async topMatches(query: string, filter?: string): Promise<DictDoc[]> {
    const lower = query.toLowerCase()
    const match = `(word = ${q1(query)} OR tr = ${q1(lower)})`
    const r = await this.req<{ hits?: DictDoc[] }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: 8, filter: [match, filter].filter(Boolean).join(' AND '), sort: ['rank:desc'] }),
    }, [404])
    return r?.hits ?? []
  }

  private foldersCache: { at: number; data: { total: number; level: Record<string, number>; pos: Record<string, number> } } | null = null

  /** Папки меню «Все слова»: сколько слов в каждом уровне и в каждой части речи. Кэш на час (база не меняется). */
  async folders() {
    this.notWhileIndexing()
    if (this.foldersCache && Date.now() - this.foldersCache.at < 3_600_000) return this.foldersCache.data
    const r = await this.req<MeiliSearch & { facetDistribution?: { level?: Record<string, number>; pos?: Record<string, number> } }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: 0, facets: ['level', 'pos'] }),
    }, [404])
    if (!r) throw new ServiceUnavailableException({ error: 'словарь ещё не проиндексирован' })
    const data = { total: Number(r.estimatedTotalHits) || 0, level: r.facetDistribution?.level ?? {}, pos: r.facetDistribution?.pos ?? {} }
    if (data.total > 0) this.foldersCache = { at: Date.now(), data }
    return data
  }

  private collectionCache = new Map<string, { at: number; data: unknown }>()

  private async collectionRows(slug: string) {
    const c = collectionBySlug(slug)
    if (!c) throw new NotFoundException({ error: 'такой подборки нет' })
    const r = await this.req<MeiliSearch>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: c.limit, filter: c.filter, sort: ['freq:asc', 'rank:desc'], attributesToRetrieve: ['id', 'word', 'hom', 'pron', 'pos', 'level', 'ru', 'freq', 'grade'] }),
    }, [404])
    if (!r) throw new ServiceUnavailableException({ error: 'словарь ещё не проиндексирован' })
    const seen = new Set<string>()
    const items = (r.hits ?? []).filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true))).map(d => ({
      word: d.word, hom: d.hom, pron: d.pron, pos: d.pos, level: d.level, ru: shortRu(d.ru), grade: d.grade,
    }))
    return { c, items }
  }

  /** Список подборок для страницы `/dict/podborki`: название, описание и сколько слов в каждой. Кэш на час. */
  async collections() {
    this.notWhileIndexing()
    const hit = this.collectionCache.get('*')
    if (hit && Date.now() - hit.at < 3_600_000) return hit.data
    const data = await Promise.all(COLLECTIONS.map(async c => {
      const r = await this.req<MeiliSearch>(`/indexes/${INDEX}/search`, { method: 'POST', body: JSON.stringify({ q: '', limit: 0, filter: c.filter }) }, [404])
      return { slug: c.slug, title: c.title, description: c.description, count: Math.min(c.limit, Number(r?.estimatedTotalHits) || 0) }
    }))
    if (data.every(d => d.count > 0)) this.collectionCache.set('*', { at: Date.now(), data })
    return data
  }

  /** Одна подборка: заголовки, вступление и слова (самые употребительные первыми). Кэш на час. */
  async collection(slug: string) {
    this.notWhileIndexing()
    const hit = this.collectionCache.get(slug)
    if (hit && Date.now() - hit.at < 3_600_000) return hit.data
    const { c, items } = await this.collectionRows(slug)
    const data = { slug: c.slug, title: c.title, seoTitle: c.seoTitle, description: c.description, intro: c.intro, items, others: COLLECTIONS.filter(o => o.slug !== slug).map(o => ({ slug: o.slug, title: o.title })) }
    if (items.length) this.collectionCache.set(slug, { at: Date.now(), data })
    return data
  }

  /** Список всех слов для меню слева: по «популярности» или по алфавиту, порциями. */
  async list(opts: { order?: string; level?: string; pos?: string; offset?: number; limit?: number }) {
    if (this.indexing) throw new ServiceUnavailableException({ error: 'словарь сейчас индексируется' })
    const limit = Math.min(100, Math.max(1, Number.isSafeInteger(opts.limit) ? opts.limit! : 60))
    const offset = Number.isSafeInteger(opts.offset) ? Math.min(59_900, Math.max(0, opts.offset!)) : 0
    const filters: string[] = []
    if (opts.level && LEVELS.includes(opts.level)) filters.push(`level = ${q1(opts.level)}`)
    if (opts.pos) filters.push(`pos = ${q1(opts.pos.slice(0, 40))}`)
    const sort = opts.order === 'abc' ? ['word:asc', 'hom:asc'] : ['rank:desc']
    const r = await this.req<MeiliSearch>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit, offset, filter: filters.join(' AND ') || undefined, sort, attributesToRetrieve: ['id', 'word', 'hom', 'pos', 'level', 'ru'] }),
    }, [404])
    if (!r) throw new ServiceUnavailableException({ error: 'словарь ещё не проиндексирован' })
    const items = (r.hits ?? []).map(d => ({ id: d.id, word: d.word, hom: d.hom, pos: d.pos, level: d.level, ru: shortRu(d.ru).split('; ').slice(0, 2).join('; ') }))
    return { items, total: Math.max(0, Number(r.estimatedTotalHits) || items.length), limit, offset }
  }

  /** Слово могли написать в спряжении: достаём словарные формы-кандидаты (только глаголы и прилагательные). */
  private async viaForms(query: string, filter?: string): Promise<DictDoc[]> {
    const cands = dictionaryForms(query)
    if (!cands.length) return []
    const byWord = `word IN [${cands.map(q1).join(', ')}]`
    const r = await this.req<{ hits?: DictDoc[] }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: 8, filter: [byWord, filter].filter(Boolean).join(' AND '), sort: ['levelRank:desc'] }),
    }, [404])
    return (r?.hits ?? []).filter(h => isPredicate(h.posKo))
  }

  /** Все записи слова (омонимы по порядку) + слова, в которых оно содержится. */
  async word(word: string) {
    const w = word.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY)
    if (!w) throw new BadRequestException({ error: 'пустое слово' })
    const r = await this.req<{ hits?: DictDoc[] }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: '', limit: 20, filter: `word = ${q1(w)}`, sort: ['hom:asc'] }),
    }, [404])
    const entries = r?.hits ?? []
    if (!entries.length) throw new NotFoundException({ error: 'такого слова нет' })
    const derived = await this.req<{ hits?: DictDoc[] }>(`/indexes/${INDEX}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: w, limit: 30, filter: `word != ${q1(w)}`, attributesToRetrieve: ['id', 'word', 'pos', 'level', 'ru'], attributesToSearchOn: ['word'] }),
    })
    const seen = new Set<string>()
    const related = (derived?.hits ?? [])
      .filter(d => d.word.includes(w) && !seen.has(d.word) && (seen.add(d.word), true))
      .slice(0, 12)
      .map(d => ({ word: d.word, pos: d.pos, level: d.level, ru: d.ru.split('; ').slice(0, 3).join('; ') }))
    // слова из той же темы базы (поле «semantic_category», например «인간 > 신체 행위»): ссылки на странице слова и для поисковика, и для читателя
    const cat = entries.find(e => e.cat)?.cat
    const same = cat
      ? await this.req<{ hits?: DictDoc[] }>(`/indexes/${INDEX}/search`, {
        method: 'POST',
        body: JSON.stringify({ q: '', limit: 40, filter: `cat = ${q1(cat)} AND word != ${q1(w)}`, sort: ['rank:desc'], attributesToRetrieve: ['id', 'word', 'pos', 'level', 'ru'] }),
      }, [404])
      : null
    const seenSame = new Set<string>()
    const similar = (same?.hits ?? [])
      .filter(d => !seenSame.has(d.word) && (seenSame.add(d.word), true))
      .slice(0, 12)
      .map(d => ({ word: d.word, pos: d.pos, level: d.level, ru: d.ru.split('; ').slice(0, 3).join('; ') }))
    return { word: w, entries, related, similar, category: cat ?? '' }
  }
}
