import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { useGrammarPhotos } from '@/composables/useGrammarPhotos'
import { photoKey, photoOf } from '@/data/korean/grammarPhotos'

/** владелец или гость: окно карточки берёт это из хранилища прогресса */
const who = vi.hoisted(() => ({ owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, isGuest: () => !who.owner, bearer: () => 'токен сеанс' }
  return {
    ...real,
    // настоящее хранилище, только вход подменён: войти по-настоящему без сервера нельзя
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit | undefined][]

afterEach(() => {
  vi.unstubAllGlobals()
  who.owner = true
  useGrammarModal().close()
})

describe('фото карточек грамматики: имена файлов', () => {
  it('своя карточка берёт own-<id>, пройденный урок части 1 lesson-N, остальным фото не положено', () => {
    expect(photoKey({ id: 'hago', st: 'ok' })).toBe('own-hago')
    expect(photoKey({ id: 'x', l: 'Урок 3', st: 'ok' })).toBe('lesson-3')
    expect(photoKey({ id: 'x', l: 'Урок 3', st: 'soon' })).toBeUndefined()
    expect(photoKey({ id: 'x', l: 'Часть 2 · Урок 3', st: 'ok' })).toBeUndefined()
    expect(photoKey({ id: 'past', l: 'Урок 16-1', st: 'ok' })).toBe('own-past_my')
    expect(photoOf({ id: 'hago', st: 'ok' })).toBe('/api/pic/grammar/own-hago.webp')
    expect(photoOf({ id: 'нет_такой', st: 'ok' })).toBeUndefined()
    expect(photoOf({ id: 'новая', st: 'soon' }, new Set(['own-новая']))).toBe('/api/pic/grammar/own-новая.webp')
  })
})

describe('фото карточек грамматики: список с Диска и управление', () => {
  it('список приходит с сервера один раз, загрузка и удаление меняют его и просят свежую ссылку', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ keys: ['own-hago', 'own-pyeong'] })
      if (init?.method === 'DELETE') return json({ keys: ['own-pyeong'] })
      return json({ keys: ['own-hago'] })
    }))
    const p = useGrammarPhotos()
    const hago = { id: 'hago', st: 'ok' }
    const pyeong = { id: 'pyeong', st: 'ok' }
    const man = { id: 'man', st: 'ok' }
    // до ответа сервера работает список из кода
    expect(p.photoOf(man)).toBe('/api/pic/grammar/own-man.webp')
    await p.load()
    await p.load()
    expect(calls().length).toBe(1)
    expect(p.photoOf(man)).toBeUndefined()
    expect(p.photoOf(hago)).toBe('/api/pic/grammar/own-hago.webp')
    expect(p.photoOf(pyeong)).toBeUndefined()

    await p.upload('own-pyeong', new File(['x'], 'a.png', { type: 'image/png' }))
    const [url, init] = calls()[1]!
    expect(url).toBe('/api/pic/grammar/own-pyeong/file')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer токен сеанс')
    expect(init!.body).toBeInstanceOf(FormData)
    expect(p.photoOf(pyeong)).toMatch(/^\/api\/pic\/grammar\/own-pyeong\.webp\?fresh=\d+$/)

    await p.remove('own-hago')
    expect(calls()[2]![0]).toBe('/api/pic/grammar/own-hago')
    expect(p.photoOf(hago)).toBeUndefined()

    // картинка не загрузилась: один раз просим свежую ссылку
    await p.upload('own-hago', new File(['x'], 'a.png'))
    const first = p.photoOf(hago)
    p.failed(hago)
    expect(p.photoOf(hago)).toBe(first)
  })

  it('ошибка сервера не меняет список и объясняется по-русски', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'disk' }, 503)))
    const p = useGrammarPhotos()
    const before = p.photoOf({ id: 'pyeong', st: 'ok' })
    await expect(p.upload('own-pyeong', new File(['x'], 'a.png'))).rejects.toThrow('Яндекс.Диск не ответил')
    expect(p.photoOf({ id: 'pyeong', st: 'ok' })).toBe(before)
  })
})

describe('окно карточки: кнопки фото', () => {
  it('владелец видит «Заменить» и «Удалить» у фото, выбранный файл уходит на сервер', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ keys: ['own-pyeong'] })))
    useGrammarModal().open('pyeong', true)
    const w = await mountSuspended(GrammarModal)
    await flushPromises()
    expect(w.findAll('.gpht button').map(b => b.text())).toEqual(['Заменить', 'Удалить'])
    expect(w.findAll('.phm button').map(b => b.text())).toEqual(['Заменить', 'Удалить'])

    const input = w.find('input[type=file]')
    await w.find('.gpht button').trigger('click')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })], configurable: true })
    await input.trigger('change')
    await flushPromises()
    const post = calls().find(c => c[1]?.method === 'POST')
    expect(post?.[0]).toBe('/api/pic/grammar/own-pyeong/file')
    w.unmount()
  })

  it('у карточки без фото владелец видит «Загрузить фото», гость не видит ничего', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ keys: [] })))
    useGrammarModal().open('pyeong', true)
    const w = await mountSuspended(GrammarModal)
    await w.find('.gpht .del').trigger('click') // окно подтверждения остаётся без ответа: фото на месте
    await flushPromises()
    expect(calls().some(c => c[1]?.method === 'DELETE')).toBe(false)
    w.unmount()

    useGrammarModal().open('iyo', false)
    const lesson = await mountSuspended(GrammarModal)
    expect(lesson.find('.gpht').exists()).toBe(false)
    expect(lesson.find('.gpha').exists()).toBe(false)
    lesson.unmount()

    who.owner = false
    useGrammarModal().open('pyeong', true)
    const guest = await mountSuspended(GrammarModal)
    expect(guest.find('.gpht').exists()).toBe(false)
    expect(guest.find('.phm').exists()).toBe(false)
    expect(guest.find('input[type=file]').exists()).toBe(true)
    guest.unmount()
  })
})
