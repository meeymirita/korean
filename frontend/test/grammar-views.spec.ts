import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrammarView from '@/views/korean/GrammarView.vue'
import { G } from '@/data/korean/grammar'
import { moveId, orderBy, shelvesOf, spineLabel, spineSize } from '@/lib/grammarView'

// виды страницы грамматики: селект, адрес ?view= и помощники полки
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, isGuest: () => false, bearer: () => 'токен' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

beforeEach(() => {
  sessionStorage.clear()
})

describe('страница грамматики: виды', () => {
  it('по умолчанию плитки, а селект стоит рядом с галочкой «пройдено» и знает четыре вида', async () => {
    const w = await mountSuspended(GrammarView)
    await flushPromises()
    const sel = w.find('select.gview')
    expect(sel.exists()).toBe(true)
    expect(sel.findAll('option').map(o => o.text())).toEqual(['Карточки', 'Книжная полка', 'Колонки, как в Finder', '«Что хочешь сказать?»'])
    expect((sel.element as HTMLSelectElement).value).toBe('cards')
    expect(w.find('.gshelf').exists()).toBe(false)
    expect(w.find('.gg').attributes('style') ?? '').not.toContain('display: none')
  })

  it('?view=shelf показывает полки, а плитки остаются в разметке скрытыми', async () => {
    const w = await mountSuspended(GrammarView, { route: '/korean/grammar?view=shelf' })
    await flushPromises()
    expect(w.find('.gshelf').exists()).toBe(true)
    expect(w.findAll('.gshelf .spine').length).toBeGreaterThan(5)
    expect(w.find('.gg').attributes('style')).toContain('display: none')
    expect(w.findAll('button.gc').length).toBeGreaterThan(0)
  })

  it('?view=columns показывает разделы, а выбор карточки открывает предпросмотр', async () => {
    const w = await mountSuspended(GrammarView, { route: '/korean/grammar?view=columns' })
    await flushPromises()
    expect(w.find('.gcols').exists()).toBe(true)
    const secs = w.findAll('.gcols .col.s .it')
    expect(secs.length).toBeGreaterThan(3)
    await secs[1]!.trigger('click')
    const cards = w.findAll('.gcols .col:not(.s) .it')
    expect(cards.length).toBeGreaterThan(0)
    await cards[0]!.trigger('click')
    expect(w.find('.gcols .pv').exists()).toBe(true)
  })

  it('?view=ask начинает диалог с вопроса и вариантами задач', async () => {
    const w = await mountSuspended(GrammarView, { route: '/korean/grammar?view=ask' })
    await flushPromises()
    await new Promise(r => setTimeout(r, 450))
    await flushPromises()
    expect(w.find('.gask').exists()).toBe(true)
    expect(w.text()).toContain('Что ты хочешь сказать по-корейски?')
    expect(w.findAll('.gask .opts .o').length).toBeGreaterThan(3)
  })
})

describe('помощники полки', () => {
  it('полки: свои и книга 1A на одной, книга 1B на другой; пустые не показываются', () => {
    const shelves = shelvesOf(G, 'Мои карточки · Книга 1A')
    expect(shelves.map(s => s.key)).toEqual(['mine', '1B'])
    expect(shelves.every(s => s.cards.length > 0)).toBe(true)
    expect(shelves[0]!.cards.every(g => !g.bk?.startsWith('1B '))).toBe(true)
    expect(shelves[1]!.cards.every(g => g.bk?.startsWith('1B '))).toBe(true)
    expect(shelvesOf(G.filter(g => !g.bk?.startsWith('1B ')), 'x').map(s => s.key)).toEqual(['mine'])
  })

  it('перестановка и сохранённый порядок', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveId(['a', 'b'], 'a', 'zzz', true)).toEqual(['a', 'b'])
    const cards = G.slice(0, 4)
    const ids = [cards[3]!.id, cards[1]!.id]
    expect(orderBy(cards, ids).map(g => g.id)).toEqual([cards[3]!.id, cards[1]!.id, cards[0]!.id, cards[2]!.id])
    expect(orderBy(cards, undefined)).toBe(cards)
  })

  it('надпись корешка короткая, без русских слов; высота растёт с надписью', () => {
    for (const g of G) {
      const label = spineLabel(g)
      expect([...label].length).toBeLessThanOrEqual(8)
      expect(label).not.toMatch(/[А-Яа-яЁё]/)
      expect(label.length).toBeGreaterThan(0)
      expect(spineSize(g).h).toBeGreaterThanOrEqual([...label].length * 14 + 34)
    }
  })
})
