import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyVocab, buildDocs, rankOf, toDoc, type RawEntry } from '../src/dict/dict.data'
import { COLLECTIONS } from '../src/dict/dict.collections'
import { VOCAB } from '../src/dict/dict.vocab'
import { dictionaryForms } from '../src/dict/dict.hangul'
import { DictService, INDEX_VERSION, isIndexFresh, sitemapNeighbors } from '../src/dict/dict.service'

const entry = (over: Partial<RawEntry> = {}): RawEntry => ({
  word: '학생',
  homonym_number: '0',
  part_of_speech: '명사',
  vocabulary_level: '초급',
  semantic_category: '교육 > 교수 학습 주체',
  word_forms: [{ type: '발음', pronunciation: '학ː쌩' }],
  senses: [{
    definition: '학교에 다니면서 공부하는 사람.',
    translations: [{ translation: 'ученик; студент', definition: 'Тот, кто учится.' }],
    examples: [
      { type: '구', text: '성실한 학생.' },
      { type: '문장', text: '학생들은 강의실을 나갔다.' },
      { type: '대화', text: '학생이에요?' },
    ],
  }],
  ...over,
})

describe('большой словарь: документы для индекса', () => {
  it('переводит часть речи и уровень на русский, убирает знак долготы и раскладывает примеры по видам', () => {
    const d = toDoc(entry(), 7)!
    expect(d).toMatchObject({ id: 'e7', word: '학생', hom: 0, pos: 'существительное', level: 'начальный', levelRank: 3, pron: '학쌩', ru: 'ученик; студент', wordLen: 2 })
    expect(d.senses[0]).toMatchObject({ sent: ['학생들은 강의실을 나갔다.'], phr: ['성실한 학생.'], dial: ['학생이에요?'] })
  })

  it('берёт спряжённые формы из словаря и не дублирует их', () => {
    const d = toDoc(entry({ word_forms: [{ type: '발음', pronunciation: '가다' }, { type: '활용', writtenForm: '가는' }, { type: '활용', writtenForm: '가는' }, { type: '활용', writtenForm: '갑니다' }] }), 0)!
    expect(d.forms).toEqual(['가는', '갑니다'])
  })

  it('пропускает записи вообще без перевода и оставляет те, где есть хотя бы описание', () => {
    const none = entry({ senses: [{ definition: 'x', translations: [], examples: [] }] })
    const onlyDef = entry({ senses: [{ definition: 'x', translations: [{ translation: '', definition: 'Только описание.' }], examples: [] }] })
    expect(buildDocs([none, onlyDef, entry()]).map(d => d.id)).toEqual(['e1', 'e2'])
    expect(toDoc(onlyDef, 0)!.ru).toBe('Только описание.')
  })

  it('неизвестные часть речи и уровень не ломают запись', () => {
    const d = toDoc(entry({ part_of_speech: '', vocabulary_level: '' }), 0)!
    expect(d.pos).toBe('выражение')
    expect(d.level).toBe('нет')
  })
})

describe('большой словарь: алфавитные соседи', () => {
  it('возвращает предыдущее и следующее слово, а на границах — null', () => {
    const words = ['가다', '나다', '다다']
    expect(sitemapNeighbors(words, '나다')).toEqual({ previous: '가다', next: '다다' })
    expect(sitemapNeighbors(words, '가다')).toEqual({ previous: null, next: '나다' })
    expect(sitemapNeighbors(words, '다다')).toEqual({ previous: '나다', next: null })
    expect(sitemapNeighbors(words, '없다')).toEqual({ previous: null, next: null })
  })
})

describe('большой словарь: алфавитный указатель', () => {
  it('строит ссылки на начальные буквы и слоги и отдаёт слова порциями', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const words = ['가다', '가게', '나다']
    const docs = words.map((word, i) => ({ id: `id${i}`, word, hom: 1, pos: 'глагол', level: 'начальный', ru: `перевод ${i}` }))
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/documents?')) return new Response(JSON.stringify({ results: words.map(word => ({ word })) }), { status: 200 })
      const body = JSON.parse(String(init?.body)) as { filter: string }
      const selected = words.filter(word => body.filter.includes(`"${word}"`))
      return new Response(JSON.stringify({ hits: docs.filter(doc => selected.includes(doc.word)) }), { status: 200 })
    }))
    const svc = new DictService()
    const map = await svc.sitemap()
    expect(map.map(x => x.loc)).toContain('/dict/a')
    expect(map.map(x => x.loc)).toContain('/dict/a/ㄱ')
    expect(map.map(x => x.loc)).toContain('/dict/a/가')
    const index = await svc.alphabetIndex()
    expect(index.letters.find(x => x.value === 'ㄱ')).toMatchObject({ count: 2, syllables: [{ value: '가', count: 2 }] })
    const page = await svc.alphabet('ㄱ', 0, 1)
    expect(page).toMatchObject({ initial: 'ㄱ', total: 2, items: [{ word: '가게', ru: 'перевод 1' }] })
  })
})

describe('большой словарь: словарная форма по спрягаемой', () => {
  const has = (typed: string, dict: string) => expect(dictionaryForms(typed)).toContain(dict)
  it('находит начальную форму частых спряжений', () => {
    has('먹었어요', '먹다')
    has('갔어요', '가다')
    has('가요', '가다')
    has('갑니다', '가다')
    has('했어요', '하다')
    has('공부해요', '공부하다')
    has('마셨어요', '마시다')
    has('봤어요', '보다')
    has('왔어요', '오다')
    has('예뻐요', '예쁘다')
    has('더워요', '덥다')
    has('들어요', '듣다')
    has('몰라요', '모르다')
    has('빨개요', '빨갛다')
    has('도와요', '돕다')
  })
  it('пустое и не хангыль не трогает', () => {
    expect(dictionaryForms('')).toEqual([])
    expect(dictionaryForms('school')).toEqual([])
    expect(dictionaryForms('가 다')).toEqual([])
  })
})

const env = { url: process.env.MEILISEARCH_URL, key: process.env.MEILISEARCH_MASTER_KEY }
afterEach(() => {
  vi.unstubAllGlobals()
  if (env.url === undefined) delete process.env.MEILISEARCH_URL
  else process.env.MEILISEARCH_URL = env.url
  if (env.key === undefined) delete process.env.MEILISEARCH_MASTER_KEY
  else process.env.MEILISEARCH_MASTER_KEY = env.key
})

describe('большой словарь: поиск', () => {
  const doc = (word: string, posKo = '동사') => ({ id: word, word, hom: 0, posKo, pos: 'глагол', level: 'начальный', levelRank: 3, pron: '', cat: '', ru: 'ходить', def: 'x', forms: [], wordLen: 2, senses: Array.from({ length: 6 }, () => ({ ko: 'k', ru: [{ t: 'ходить', d: '' }], sent: ['а', 'б'], phr: ['в'], dial: ['г'] })) })

  it('без настроенного Meilisearch отвечает понятной ошибкой и не ходит в сеть', async () => {
    delete process.env.MEILISEARCH_URL
    delete process.env.MEILISEARCH_MASTER_KEY
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(new DictService().search('가다')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('пустой запрос ничего не ищет', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const r = await new DictService().search('   ')
    expect(r.hits).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('урезает выдачу: 4 значения и один пример, остальное считает', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const fetch = vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const hits = body.filter?.includes('word IN') ? [] : [doc('가다')]
      return new Response(JSON.stringify({ hits, estimatedTotalHits: 1, facetDistribution: { level: { начальный: 1 }, pos: { глагол: 1 } } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetch)
    const r = await new DictService().search('가다')
    expect(r.hits[0]!.senses).toHaveLength(4)
    expect(r.hits[0]!.senses[0]!.sent).toEqual(['а'])
    expect(r.hits[0]!.moreSenses).toBe(2)
    expect(r.hits[0]).not.toHaveProperty('def')
    expect(r.facets.level).toEqual({ начальный: 1 })
  })

  it('спряжённую форму выводит выше: ищет начальную форму среди глаголов и прилагательных', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      calls.push(String(body.filter ?? ''))
      const viaCall = String(body.filter ?? '').includes('word IN')
      const hits = viaCall ? [doc('먹다'), doc('먹이', '명사')] : [doc('잘라먹다')]
      return new Response(JSON.stringify({ hits, estimatedTotalHits: 1 }), { status: 200 })
    }))
    const r = await new DictService().search('먹었어요')
    expect(r.via?.forms).toEqual(['먹다'])
    expect(r.hits.map(h => h.word)).toEqual(['먹다', '잘라먹다'])
    expect(calls.some(c => c.includes('"먹다"'))).toBe(true)
  })

  it('слово, которое и так есть в словаре, не принимают за спряжение', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      const hits = String(body.filter ?? '').includes('word IN') ? [doc('비다')] : [doc('비빔밥', '명사')]
      return new Response(JSON.stringify({ hits: hits.map(h => ({ ...h, word: '비빔' })), estimatedTotalHits: 1 }), { status: 200 })
    }))
    const r = await new DictService().search('비빔')
    expect(r.via).toBeUndefined()
  })

  it('фильтры уровня и части речи уходят в Meilisearch, неизвестный уровень игнорируется', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ hits: [], estimatedTotalHits: 0 }), { status: 200 })
    }))
    await new DictService().search('школа', { level: 'начальный', pos: 'глагол' })
    const main = (list: Record<string, unknown>[]) => list.find(b => b.facets)!
    expect(main(bodies).filter).toBe('level = "начальный" AND pos = "глагол"')
    bodies.length = 0
    await new DictService().search('школа', { level: 'выдуманный' })
    expect(main(bodies).filter).toBeUndefined()
  })
})

describe('большой словарь: готов ли индекс', () => {
  const file = { size: 100, mtimeMs: 5 }
  it('готов только если пометка совпадает с файлом и числом документов', () => {
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10, version: INDEX_VERSION }, file, 10)).toBe(true)
  })
  it('без пометки, с другим файлом или с недостроенным числом документов не готов (так сервер доделает индекс после обрыва)', () => {
    expect(isIndexFresh(null, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 101, mtimeMs: 5, documents: 10, version: INDEX_VERSION }, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10 }, file, 10)).toBe(false) // пометка от старой версии формата
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10, version: INDEX_VERSION - 1 }, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 6, documents: 10, version: INDEX_VERSION }, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10, version: INDEX_VERSION }, file, 4)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 0, version: INDEX_VERSION }, file, 0)).toBe(false)
  })
})

describe('большой словарь: популярность и точные совпадения', () => {
  it('частые слова получают больше очков: уровень, значения, примеры, короткое слово; окончания и выражения идут в конец', () => {
    const common = toDoc(entry({ word: '학교', vocabulary_level: '초급' }), 0)!
    const rare = toDoc(entry({ word: '농업기술센터', vocabulary_level: '없음' }), 1)!
    const idiom = toDoc(entry({ word: '교편을 잡다', part_of_speech: '', vocabulary_level: '' }), 2)!
    const ending = toDoc(entry({ word: '-ㅂ니다', part_of_speech: '어미', vocabulary_level: '없음' }), 3)!
    expect(common.rank).toBeGreaterThan(rare.rank)
    expect(rare.rank).toBeGreaterThan(idiom.rank)
    expect(rare.rank).toBeGreaterThan(ending.rank)
    expect(rankOf(common)).toBe(common.rank)
  })

  it('переводы раскладываются по одному (строчными) из двух первых значений: по ним слово ищется точно', () => {
    const d = toDoc(entry({ senses: [
      { definition: 'a', translations: [{ translation: 'Школа; учебное заведение', definition: '' }], examples: [] },
      { definition: 'b', translations: [{ translation: 'направление', definition: '' }], examples: [] },
      { definition: 'c', translations: [{ translation: 'третье значение', definition: '' }], examples: [] },
    ] }), 0)!
    expect(d.tr).toEqual(['школа', 'учебное заведение', 'направление'])
  })

  it('слово с точным переводом идёт выше остальных: запрос «школа» сначала берёт тех, у кого перевод ровно «школа»', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const mk = (word: string) => ({ id: word, word, hom: 0, posKo: '명사', pos: 'существительное', level: 'начальный', levelRank: 3, pron: '', cat: '', ru: 'школа', def: '', forms: [], wordLen: 2, rank: 300, tr: ['школа'], senses: [{ ko: 'k', ru: [{ t: 'школа', d: '' }], sent: [], phr: [], dial: [] }] })
    const filters: string[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      filters.push(String(body.filter ?? ''))
      const top = String(body.filter ?? '').includes('tr = ')
      return new Response(JSON.stringify({ hits: top ? [mk('학교')] : [mk('농고'), mk('학교')], estimatedTotalHits: 2 }), { status: 200 })
    }))
    const r = await new DictService().search('Школа')
    expect(r.hits.map(h => h.word)).toEqual(['학교', '농고'])
    expect(filters.some(f => f.includes('tr = "школа"') && f.includes('word = "Школа"'))).toBe(true)
  })

  it('список слов: порядок по популярности или алфавиту, размер порции ограничен', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ hits: [{ id: 'a', word: '가게', hom: 0, pos: 'существительное', level: 'начальный', ru: 'магазин; лавка; ларёк' }], estimatedTotalHits: 53149 }), { status: 200 })
    }))
    const pop = await new DictService().list({ order: 'pop', limit: 500 })
    expect(bodies[0]!.sort).toEqual(['rank:desc'])
    expect(bodies[0]!.limit).toBe(100)
    expect(pop.items[0]).toMatchObject({ word: '가게', ru: 'магазин; лавка' })
    expect(pop.total).toBe(53149)
    await new DictService().list({ order: 'abc', level: 'начальный' })
    expect(bodies[1]!.sort).toEqual(['word:asc', 'hom:asc'])
    expect(bodies[1]!.filter).toBe('level = "начальный"')
  })
})

describe('большой словарь: папки меню', () => {
  it('отдаёт число слов по уровням и частям речи и запоминает ответ', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ hits: [], estimatedTotalHits: 53149, facetDistribution: { level: { начальный: 1940 }, pos: { глагол: 6540 } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const svc = new DictService()
    const a = await svc.folders()
    expect(a).toEqual({ total: 53149, level: { начальный: 1940 }, pos: { глагол: 6540 } })
    await svc.folders()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('большой словарь: частотный список и подборки', () => {
  it('список 국립국어원 загружен целиком и отсортирован по рейтингу частоты', () => {
    expect(VOCAB.length).toBeGreaterThan(5800)
    expect(VOCAB[0]).toEqual([1, '것', '의존 명사', 'A'])
    expect(VOCAB.slice(0, 10).map(v => v[1])).toContain('하다')
    expect(VOCAB.every(v => v[3] === 'A' || v[3] === 'B' || v[3] === 'C')).toBe(true)
  })

  it('рейтинг ставится по слову и части речи; омонимы с одним написанием не получают его дважды', () => {
    const docs = buildDocs([
      entry({ word: '가다', homonym_number: '1', part_of_speech: '동사' }),
      entry({ word: '가다', homonym_number: '2', part_of_speech: '동사' }),
      entry({ word: '학교', part_of_speech: '명사' }),
      entry({ word: '희귀어', part_of_speech: '명사' }),
    ])
    const go = docs.filter(d => d.word === '가다')
    expect(go.filter(d => d.freq !== undefined)).toHaveLength(1)
    expect(go[0]!.freq).toBeLessThan(100)
    expect(go[0]!.grade).toBe('A')
    expect(docs.find(d => d.word === '희귀어')!.freq).toBeUndefined()
  })

  it('слово из списка получает прибавку к популярности, редкое нет', () => {
    const [a, b] = [entry({ word: '학교' }), entry({ word: '희귀어' })].map((e, i) => toDoc(e, i)!)
    const before = a!.rank
    applyVocab([a!, b!], [[100, '학교', '명사', 'A']])
    expect(a!.rank).toBeGreaterThan(before)
    expect(b!.rank).toBe(b!.rank)
    expect(b!.freq).toBeUndefined()
  })

  it('у каждой подборки уникальный адрес, описание нужной длины и фильтр', () => {
    const slugs = COLLECTIONS.map(c => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const c of COLLECTIONS) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/)
      expect(c.description.length).toBeGreaterThanOrEqual(60)
      expect(c.description.length).toBeLessThanOrEqual(190)
      expect(c.seoTitle.length).toBeLessThanOrEqual(60)
      expect(c.filter).toBeTruthy()
      expect(c.limit).toBeGreaterThan(0)
    }
  })

  it('подборка просит у Meilisearch самые частые слова первыми и убирает повторы и длинные описания', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const bodies: Record<string, unknown>[] = []
    const hit = (id: string, word: string, ru: string) => ({ id, word, hom: 1, pron: word, pos: 'глагол', level: 'начальный', ru, freq: 1, grade: 'A' })
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ hits: [hit('a', '하다', 'делать; делать; ' + 'очень длинное описание значения, которое не годится для списка '.repeat(2)), hit('a', '하다', 'делать'), hit('b', '가다', 'идти')], estimatedTotalHits: 3 }), { status: 200 })
    }))
    const svc = new DictService()
    const c = (await svc.collection('top-100')) as { items: { word: string; ru: string }[]; title: string }
    expect(bodies[0]).toMatchObject({ limit: 100, sort: ['freq:asc', 'rank:desc'] })
    expect(c.items.map(i => i.word)).toEqual(['하다', '가다'])
    expect(c.items[0]!.ru).toBe('делать')
    await svc.collection('top-100')
    expect(bodies).toHaveLength(1)
    await expect(svc.collection('нет-такой')).rejects.toThrow()
  })

  it('пока идёт сборка индекса, карта сайта, папки и подборки не отдаются и не запоминаются', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const svc = new DictService() as unknown as { indexing: boolean; sitemap(): Promise<unknown>; folders(): Promise<unknown>; collections(): Promise<unknown>; collection(s: string): Promise<unknown> }
    svc.indexing = true
    await expect(svc.sitemap()).rejects.toMatchObject({ status: 503 })
    await expect(svc.folders()).rejects.toMatchObject({ status: 503 })
    await expect(svc.collections()).rejects.toMatchObject({ status: 503 })
    await expect(svc.collection('top-100')).rejects.toMatchObject({ status: 503 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('карта сайта отдаёт исходные слова без двойного URL-кодирования', async () => {
    process.env.MEILISEARCH_URL = 'http://meili:7700'
    process.env.MEILISEARCH_MASTER_KEY = 'k'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ word: '학생' }, { word: '가다' }] }), { status: 200 })))
    const urls = await new DictService().sitemap()
    expect(urls).toContainEqual({ loc: '/dict/학생' })
    expect(urls).toContainEqual({ loc: '/dict/가다' })
    expect(urls.some(({ loc }) => /%25/i.test(loc))).toBe(false)
  })
})
