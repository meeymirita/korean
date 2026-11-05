import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'
import { SearchClient } from '../src/search/search.client'
import type { Db } from '../src/db/db.service'

const client = () => new SearchClient({ orm: vi.fn() } as unknown as Db)

const env = { url: process.env.MEILISEARCH_URL, key: process.env.MEILISEARCH_MASTER_KEY }

afterEach(() => {
  vi.unstubAllGlobals()
  if (env.url === undefined) delete process.env.MEILISEARCH_URL
  else process.env.MEILISEARCH_URL = env.url
  if (env.key === undefined) delete process.env.MEILISEARCH_MASTER_KEY
  else process.env.MEILISEARCH_MASTER_KEY = env.key
})

describe('поиск учебных материалов в Meilisearch', () => {
  it('сообщает о ненастроенном сервисе, не делая запрос в сеть', async () => {
    delete process.env.MEILISEARCH_URL
    delete process.env.MEILISEARCH_MASTER_KEY
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(client().status()).resolves.toEqual({
      configured: false,
      available: false,
      indexed: false,
      documents: 0,
      message: 'Meilisearch не настроен',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('передаёт поисковый ключ только серверному Meilisearch и возвращает разрешённые поля', async () => {
    process.env.MEILISEARCH_URL = 'http://meilisearch:7700/'
    process.env.MEILISEARCH_MASTER_KEY = 'server-only-test-key'
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uid: 'study-materials' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hits: [{
        id: 'word:1', category: 'word', title: '학교', text: 'школа', target: '/words#학교', private: 'секрет',
      }], estimatedTotalHits: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)

    await expect(client().search('  학교   школа ', 30, 'word')).resolves.toEqual({
      query: '학교 школа',
      hits: [{ id: 'word:1', category: 'word', title: '학교', text: 'школа', target: '/words#학교' }],
      total: 1,
      limit: 100,
      offset: 30,
    })
    expect(fetch.mock.calls[0]?.[0]).toBe('http://meilisearch:7700/indexes/study-materials')
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer server-only-test-key')
    expect(fetch.mock.calls[1]?.[0]).toBe('http://meilisearch:7700/indexes/study-materials/search')
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).offset).toBe(30)
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).filter).toBe('category = word')
  })

  it('отклоняет приватные/неподдерживаемые категории и небезопасные ссылки при полной переиндексации', async () => {
    process.env.MEILISEARCH_URL = 'http://meilisearch:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'server-only-test-key'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const search = client()

    await expect(search.reindex([{ id: 'note:1', category: 'note', title: 'личное', text: 'заметка' }])).rejects.toThrow()
    await expect(search.reindex([{ id: 'word:1', category: 'word', title: 'слово', text: 'описание', target: '//evil.test' }])).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('создаёт индекс, применяет настройки и дожидается полной переиндексации', async () => {
    process.env.MEILISEARCH_URL = 'http://meilisearch:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'server-only-test-key'
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/indexes/study-materials')) return new Response('', { status: 404 })
      if (url.endsWith('/indexes')) return Response.json({ taskUid: 1, status: 'enqueued' })
      if (url.includes('/tasks/')) return Response.json({ taskUid: Number(url.split('/').pop()), status: 'succeeded' })
      if (url.endsWith('/settings') || url.endsWith('/documents') || url.includes('/documents?')) return Response.json({ taskUid: calls.length, status: 'enqueued' })
      throw new Error(`неожиданный запрос: ${url}`)
    }))

    const documents = [{ id: 'form:0', category: 'form', title: '먹다', text: 'есть 먹어요 먹었어요' }]
    await expect(client().reindex(documents)).resolves.toEqual({ ok: true, documents: 1 })
    expect(calls.some(call => call.url.endsWith('/settings'))).toBe(true)
    expect(calls.some(call => call.url.endsWith('/documents') && call.init.method === 'DELETE')).toBe(true)
    const upload = calls.find(call => call.url.includes('/documents?primaryKey=id'))
    expect(JSON.parse(String(upload?.init.body))).toEqual(documents)
    const settings = calls.find(call => call.url.endsWith('/settings'))
    expect(JSON.parse(String(settings?.init.body)).pagination.maxTotalHits).toBe(25_000)
    expect(calls.every(call => new Headers(call.init.headers).get('Authorization') === 'Bearer server-only-test-key')).toBe(true)
  })

  it('строит отдельный закрытый индекс из заметок и галереи, не возвращая текст документов', async () => {
    process.env.MEILISEARCH_URL = 'http://meilisearch:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'server-only-test-key'
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/indexes/owner-materials')) return new Response('', { status: 404 })
      if (url.endsWith('/indexes')) return Response.json({ taskUid: 1, status: 'enqueued' })
      if (url.includes('/tasks/')) return Response.json({ taskUid: 1, status: 'succeeded' })
      if (url.endsWith('/settings') || url.endsWith('/documents') || url.includes('/documents?')) return Response.json({ taskUid: calls.length, status: 'enqueued' })
      throw new Error(`неожиданный запрос: ${url}`)
    }))
    const db = {
      orm: async () => ({
        note: { findMany: async () => [{ id: 'n1', title: 'личное', text: 'содержимое', tags: '["важно"]' }] },
        image: { findMany: async () => [{ id: 'i1', name: 'photo.webp', caption: 'альбом', description: 'подробно', tags: '[]' }] },
      }),
    }

    await expect(new SearchClient(db as unknown as Db).reindexPrivate()).resolves.toEqual({ ok: true, documents: 2 })
    const upload = calls.find(call => call.url.includes('/documents?primaryKey=id'))
    expect(JSON.parse(String(upload?.init.body))).toEqual([
      { id: 'note:n1', category: 'note', title: 'личное', text: 'личное содержимое ["важно"]' },
      { id: 'image:i1', category: 'image', title: 'альбом', text: 'photo.webp альбом подробно []' },
    ])
    expect(upload?.url).toContain('owner-materials')
  })

  it('возвращает 503 при сетевой ошибке поискового сервиса', async () => {
    process.env.MEILISEARCH_URL = 'http://meilisearch:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'server-only-test-key'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(client().search('학교')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
