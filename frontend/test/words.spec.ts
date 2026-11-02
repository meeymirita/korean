import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WordsView from '@/views/korean/WordsView.vue'
import { D } from '@/data/korean/words'

const visible = (w: Awaited<ReturnType<typeof mountSuspended>>) => w.findAll('.tb .row:not(.h)').filter(r => (r.element as HTMLElement).style.display !== 'none')

describe('страница «Слова»: сначала 100 слов, остальные по кнопке', () => {
  it('в разметке все слова, видны первые 100, под списком кнопка «Показать ещё»', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    expect(w.findAll('.tb .row:not(.h)').length).toBe(D.length)
    expect(visible(w).length).toBe(100)
    const more = w.find('.words-more')
    expect(more.exists()).toBe(true)
    expect(more.text()).toContain(`осталось ${D.length - 100}`)
    expect(w.text()).toContain(`Показано 100 из ${D.length}`)
  })

  it('кнопка открывает ещё 100 слов, а в конце пропадает', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.words-more').trigger('click')
    expect(visible(w).length).toBe(200)
    for (let i = 0; i < 10 && w.find('.words-more').exists(); i++) await w.find('.words-more').trigger('click')
    expect(visible(w).length).toBe(D.length)
    expect(w.find('.words-more').exists()).toBe(false)
  })

  it('новый поиск или тема снова показывают только первую сотню', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    await w.find('.words-more').trigger('click')
    expect(visible(w).length).toBe(200)
    await w.findAll('.chips .chip').find(c => c.text().includes('Еда'))!.trigger('click')
    await nextTick()
    expect(visible(w).length).toBeLessThanOrEqual(100)
    expect(w.find('.words-more').exists()).toBe(false)
  })
})
