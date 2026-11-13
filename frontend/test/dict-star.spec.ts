import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DictStar from '@/components/dict/DictStar.vue'
import MarksView from '@/views/korean/MarksView.vue'
import { useProgressStore } from '@/stores/progress'

// Избранное большого словаря: звёздочка `k:<слово>` на /dict/<слово> и блок «Из большого словаря» на «Важном».
/** вход подменён: настоящий без сервера невозможен */
const who = vi.hoisted(() => ({ unlocked: true, owner: true }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => who.unlocked, isGuest: () => !who.owner, bearer: () => 'токен сеанс' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

afterEach(() => {
  who.unlocked = true
  who.owner = true
  useProgressStore().data.settings.marks = []
  vi.unstubAllGlobals()
})

describe('звёздочка в большом словаре', () => {
  it('без входа и у гостя кнопки нет (страница открыта всем)', async () => {
    who.unlocked = false
    const a = await mountSuspended(DictStar, { props: { word: '사과' } })
    expect(a.find('button').exists()).toBe(false)
    a.unmount()
    who.unlocked = true
    who.owner = false
    const b = await mountSuspended(DictStar, { props: { word: '사과' } })
    expect(b.find('button').exists()).toBe(false)
    b.unmount()
  })

  it('слово длиннее 40 знаков отметить нельзя: кнопки нет', async () => {
    const w = await mountSuspended(DictStar, { props: { word: '가'.repeat(41) } })
    expect(w.find('button').exists()).toBe(false)
    w.unmount()
  })

  it('у владельца нажатие ставит и снимает метку k:', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const w = await mountSuspended(DictStar, { props: { word: '사과' } })
    const btn = w.find('button.dict-star')
    expect(btn.text()).toBe('☆')
    await btn.trigger('click')
    expect(useProgressStore().data.settings.marks).toEqual(['k:사과'])
    expect(w.find('button').text()).toBe('★')
    expect(w.find('button').attributes('aria-pressed')).toBe('true')
    await w.find('button').trigger('click')
    expect(useProgressStore().data.settings.marks).toEqual([])
    w.unmount()
  })
})

describe('«Важное»: блок «Из большого словаря»', () => {
  it('слова k: со ссылками на /dict/<слово>; в «Слова» и серию не попадают', async () => {
    useProgressStore().data.settings.marks = ['k:사과', 'k:먹고 싶다']
    const w = await mountSuspended(MarksView, { route: '/korean/marks' })
    const links = w.findAll('.mk-kw a')
    expect(links.map(a => a.text())).toEqual(['사과', '먹고 싶다'])
    expect(links[0]!.attributes('href')).toBe('/dict/%EC%82%AC%EA%B3%BC')
    expect(w.text()).toContain('Из большого словаря')
    expect(w.find('.tb').exists()).toBe(false)
    expect(w.find('.cb-empty').exists()).toBe(false)
    expect(w.find('.mk-go .rs-start').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('без k: блока нет', async () => {
    useProgressStore().data.settings.marks = []
    const w = await mountSuspended(MarksView, { route: '/korean/marks' })
    expect(w.find('.mk-kw').exists()).toBe(false)
    w.unmount()
  })
})
