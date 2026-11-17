import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WordsView from '@/views/korean/WordsView.vue'

// «Слова» → «Входящие»: слова и материалы, присланные владельцем или Claude по токену; таблица слов и JSON-ссылки прячутся.
let owner = true
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), {
        get: (t, k, r) => (k === 'unlocked' ? owner : k === 'role' ? (owner ? 'owner' : 'guest') : k === 'bearer' ? 'токен' : Reflect.get(t, k, r)),
      }),
  }
})

const calls: { url: string; init?: RequestInit }[] = []
const FORMAT = { about: 'Приём', auth: 'Bearer', routes: [{ method: 'POST', path: '/api/materials', auth: 'токен с записью', desc: 'пачка' }], example: { source: 'Тетрадь', kind: 'workbook', items: [{ type: 'note', text: 'заметка' }] } }
const BATCH = { id: 'b1', source: 'Workbook 1A', kind: 'workbook', status: 'new', created: 1, items: [{ type: 'word', ko: '갈비탕', reading: '', ru: 'суп', example: '', note: '' }, { type: 'sentence', ko: '사과가 싸요.', ru: 'Яблоки дешёвые.', topic: '' }] }

const LEARNING = { generated: 'x', grammar: { passedCount: 2, passed: ['은 / 는 — тема', '이 / 가 — подлежащее'], notYet: ['-고 싶다'] }, words: { learned: 7, inProgress: 3, learnedThisWeek: ['가다'], weak: [] }, activity: { streakDays: 4, lastAnswer: '2026-11-17', last7Days: { ok: 10, bad: 2, activeDays: 3, minutes: 20 }, last30Days: { ok: 50, bad: 9, activeDays: 12, minutes: 90 }, weakModes: [] }, inbox: { newWords: 1, materialsToReview: 1 } }

beforeEach(() => {
  calls.length = 0
  owner = true
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('fetch', async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u)
    calls.push({ url, init })
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status })
    if (url.endsWith('/api/learning')) return json(LEARNING)
    if (url.includes('/api/materials/format')) return json(FORMAT)
    if (url.includes('/api/materials/b1') && init?.method === 'PATCH') return json({ ...BATCH, status: 'done' })
    if (url.includes('/api/materials')) return json({ batches: [BATCH] })
    if (url.includes('/api/new-words/token')) return json({ token: 'a'.repeat(48), expires: Date.now() + 600_000, write: true })
    if (url.includes('/api/new-words')) return json({ words: [] })
    return json({})
  })
})

describe('«Слова»: «Входящие»', () => {
  it('в шапке одна кнопка; JSON-адреса на её странице', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    expect(w.findAll('.page-head button, .page-head a').map(x => x.text())).toEqual(['API'])
    expect(w.find('.page-head .title-row h1').exists() && w.find('.page-head .title-row .inbox-btn').exists(), 'кнопка в одной строке с заголовком').toBe(true)
    expect(w.findAll('.words-json').length).toBe(0)
    expect(w.find('.tb').exists()).toBe(true)
  })

  it('гостю страница «API» показывает только JSON-адреса: ни «Входящих»', async () => {
    owner = false
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    expect(w.findAll('.words-json').length).toBe(3)
    expect(w.find('.inbox').exists()).toBe(false)
    expect(w.find('.tb').exists()).toBe(false)
  })

  it('владельцу кнопка прячет таблицу и открывает страницу с адресами и «Входящими», обратно всё возвращается', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    await flushPromises()
    expect(w.find('.api-page').exists()).toBe(true)
    expect(w.findAll('.words-json').length).toBe(3)
    expect(w.find('.nw-add:not(.inbox-btn)').exists(), 'ручного добавления слов нет').toBe(false)
    expect(w.find('.inbox').exists()).toBe(true)
    expect(w.find('.tb').exists()).toBe(false)
    expect(w.find('.searchbar').exists()).toBe(false)
    expect(w.find('.inbox-btn').text()).toContain('К словарю')
    await w.find('.inbox-btn').trigger('click')
    expect(w.find('.api-page').exists()).toBe(false)
    expect(w.find('.tb').exists()).toBe(true)
    expect(w.findAll('.words-json').length).toBe(0)
  })

  it('во вкладке «Материалы» видны пачки, их можно раскрыть и отметить разобранной', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    await flushPromises()
    await w.findAll('.ib-tabs .chip')[1]!.trigger('click')
    expect(w.find('.ib-card').text()).toContain('Workbook 1A')
    expect(w.find('.ib-card').text()).toContain('слова 1')
    await w.find('.ib-title').trigger('click')
    expect(w.find('.ib-items').text()).toContain('갈비탕')
    expect(w.find('.ib-items').text()).toContain('사과가 싸요.')
    const done = w.findAll('.ib-card footer .ib-btn')[0]!
    await done.trigger('click')
    await flushPromises()
    expect(calls.some(c => c.url.endsWith('/api/materials/b1') && c.init?.method === 'PATCH')).toBe(true)
    expect(w.find('.ib-badge.ok').exists()).toBe(true)
  })

  it('токен с записью создаётся с write: true и показывает просьбу для Claude', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    await flushPromises()
    await w.findAll('.ib-tok .ib-btn')[0]!.trigger('click')
    await flushPromises()
    const call = calls.find(c => c.url.endsWith('/api/new-words/token'))!
    expect(JSON.parse(String(call.init?.body))).toEqual({ write: true })
    expect(w.find('.ib-tokbox code').text()).toBe('a'.repeat(48))
    expect(w.find('.ib-tokbox').text()).toContain('Токен с записью')
  })

  it('вкладка «Что изучено» читает /api/learning с токеном и показывает сводку и JSON', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    await flushPromises()
    await w.findAll('.ib-tabs .chip')[2]!.trigger('click')
    await flushPromises()
    const call = calls.find(c => c.url.endsWith('/api/learning'))!
    const headers = (call.init?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer токен')
    expect(w.text()).toContain('пройдено 2')
    expect(w.text()).toContain('выучено 7')
    expect(w.find('.ib-code').text()).toContain('"passedCount": 2')
  })

  it('«Как отправить»: готовые запросы на каждый маршрут', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.inbox-btn').trigger('click')
    await flushPromises()
    await w.findAll('.ib-tabs .chip')[3]!.trigger('click')
    const codes = w.findAll('.ib-code').map(c => c.text())
    expect(codes.length).toBe(6)
    expect(codes.some(c => c.includes('/api/materials/format'))).toBe(true)
    expect(codes.some(c => c.includes('-X POST') && c.includes('/api/new-words') && c.includes('"ko"'))).toBe(true)
    expect(codes.some(c => c.includes('-X POST') && c.includes('/api/materials') && c.includes('"source": "Тетрадь"'))).toBe(true)
    expect(codes.filter(c => c.includes('Authorization: Bearer ТОКЕН')).length).toBe(5)
    expect(codes.some(c => c.includes('/api/learning'))).toBe(true)
    expect(w.text()).toContain('POST /api/materials')
  })
})
