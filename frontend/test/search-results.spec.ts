import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SearchResults from '@/components/SearchResults.vue'
import { useSiteSearch } from '@/composables/useSiteSearch'

// Общие результаты поиска: окно ⌘K раскрывает найденное на месте, главная раздела ведёт на страницы.
describe('SearchResults', () => {
  const make = (query: string) => {
    const q = ref(query)
    const site = useSiteSearch(q)
    return { q, site }
  }

  it('inline: слова это кнопки, нажатие раскрывает строку и снова сворачивает', async () => {
    const { site } = make('집')
    expect(site.result.value!.words.length).toBeGreaterThan(0)
    const w = await mountSuspended(SearchResults, { props: { search: site, q: '집', mode: 'inline' } })
    expect(w.find('a.sr-r').exists()).toBe(false)
    const first = w.find('section:first-child button.sr-r')
    expect(first.exists()).toBe(true)
    await first.trigger('click')
    expect(w.find('section:first-child button.sr-r').classes()).toContain('on')
    await w.find('section:first-child button.sr-r').trigger('click')
    expect(w.find('section:first-child button.sr-r').classes()).not.toContain('on')
    w.unmount()
  })

  it('link: слова это ссылки на страницу слов с запросом', async () => {
    const { site } = make('집')
    const w = await mountSuspended(SearchResults, { props: { search: site, q: '집', mode: 'link' } })
    const a = w.find('a.sr-r')
    expect(a.exists()).toBe(true)
    expect(a.attributes('href')).toContain('/korean/words')
    w.unmount()
  })

  it('подсветка находит запрос и экранирует остальное', async () => {
    const { site } = make('집')
    const w = await mountSuspended(SearchResults, { props: { search: site, q: '집', mode: 'inline' } })
    expect(w.html()).toContain('<mark>집</mark>')
    expect(w.html()).not.toContain('<script')
    w.unmount()
  })

  it('«ещё N» раскрывает группу целиком', async () => {
    const { site } = make('요')
    const w = await mountSuspended(SearchResults, { props: { search: site, q: '요', mode: 'inline' } })
    const before = w.findAll('.sr-r').length
    const btn = w.findAll('button.chip').find(b => b.text().startsWith('ещё'))
    expect(btn, 'у частого запроса есть «ещё»').toBeTruthy()
    await btn!.trigger('click')
    expect(w.findAll('.sr-r').length).toBeGreaterThan(before)
    w.unmount()
  })
})
