import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MapView from '@/views/korean/MapView.vue'
import { G } from '@/data/korean/grammar'

// «Карта обучения»: по цветку на каждую карточку из книг 1A и 1B, пройдено только то, что отмечено в данных.
describe('карта обучения', () => {
  const A = G.filter(g => g.bk && !g.bk.startsWith('1B '))
  const B = G.filter(g => g.bk?.startsWith('1B '))
  it('в каждой книге по цветку на карточку; расцветшие = пройденные; одна «следующая» в каждой книге', async () => {
    const w = await mountSuspended(MapView)
    await flushPromises()
    const books = w.findAll('section.book')
    expect(books.length).toBe(2)
    expect(books[0]!.findAll('.fl').length).toBe(A.length)
    expect(books[1]!.findAll('.fl').length).toBe(B.length)
    expect(books[0]!.findAll('.fl.ok').length).toBe(A.filter(g => g.st === 'ok').length)
    expect(books[1]!.findAll('.fl.ok').length).toBe(B.filter(g => g.st === 'ok').length)
    for (const b of books) expect(b.findAll('.fl.next').length).toBe(1)
    expect(books[0]!.find('.cnt').text()).toBe(`${A.filter(g => g.st === 'ok').length} из ${A.length}`)
  })
  it('первая в ряду «следующая» — это первая непройденная по порядку книги; ярлыки ведут на карточки', async () => {
    const w = await mountSuspended(MapView)
    await flushPromises()
    const tags = w.findAll('section.book')[0]!.findAll('a.tag')
    const firstNotOk = tags.find(t => t.classes().includes('next'))!
    const idx = tags.indexOf(firstNotOk)
    expect(tags.slice(0, idx).every(t => t.classes().includes('ok'))).toBe(true)
    expect(tags.slice(idx + 1).every(t => !t.classes().includes('next'))).toBe(true)
    expect(firstNotOk.attributes('href')).toMatch(/^\/korean\/grammar\?g=/)
  })
})
