import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDocs, toDoc, type RawEntry } from '../src/dict/dict.data'
import { dictionaryForms } from '../src/dict/dict.hangul'
import { DictService, isIndexFresh } from '../src/dict/dict.service'

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
    expect(bodies[0]!.filter).toBe('level = "начальный" AND pos = "глагол"')
    await new DictService().search('школа', { level: 'выдуманный' })
    expect(bodies.at(-1)!.filter).toBeUndefined()
  })
})

describe('большой словарь: готов ли индекс', () => {
  const file = { size: 100, mtimeMs: 5 }
  it('готов только если пометка совпадает с файлом и числом документов', () => {
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10 }, file, 10)).toBe(true)
  })
  it('без пометки, с другим файлом или с недостроенным числом документов не готов (так сервер доделает индекс после обрыва)', () => {
    expect(isIndexFresh(null, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 101, mtimeMs: 5, documents: 10 }, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 6, documents: 10 }, file, 10)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 10 }, file, 4)).toBe(false)
    expect(isIndexFresh({ size: 100, mtimeMs: 5, documents: 0 }, file, 0)).toBe(false)
  })
})
