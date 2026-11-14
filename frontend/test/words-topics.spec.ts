import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WordsView from '@/views/korean/WordsView.vue'
import { useProgressStore, KNOWN_STREAK } from '@/stores/progress'
import { CATN } from '@/data/korean/words'
import { topicProgress, topicWords } from '@/data/korean/topics'

// «Слова»: закрепление по темам (полоска «выучено N из M» и кнопка «Добить тему»).
describe('«Слова»: закрепление по темам', () => {
  it('у каждой темы полоска и кнопка, слова только для заданий', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const cards = w.findAll('.wd-topic')
    const shown = topicProgress(useProgressStore().data).filter(t => t.total > 0)
    expect(cards.length).toBe(shown.length)
    expect(cards.length).toBeGreaterThan(5)
    expect(shown.every(t => t.name === CATN[t.id])).toBe(true)
    for (const [i, c] of cards.entries()) {
      expect(c.text()).toContain(`выучено 0 из ${shown[i]!.total}`)
      expect(c.find('.pg-bar').attributes('aria-valuemax')).toBe(String(shown[i]!.total))
      expect(c.find('.wd-topic-go').text()).toBe('Добить тему')
    }
    w.unmount()
  })

  it('блок при открытии страницы всегда свёрнут, кнопка разворачивает и сворачивает его', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const btn = w.find('.wd-topics-toggle')
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(w.find('.wd-topics-body').classes()).toContain('closed')
    expect(w.find('.wd-topics-body').attributes('inert')).toBeDefined()
    await btn.trigger('click')
    expect(btn.attributes('aria-expanded')).toBe('true')
    expect(w.find('.wd-topics-body').classes()).not.toContain('closed')
    w.unmount()
    const again = await mountSuspended(WordsView, { route: '/korean/words' })
    expect(again.find('.wd-topics-body').classes(), 'после повторного открытия снова свёрнут').toContain('closed')
    again.unmount()
  })

  it('выученная тема: надпись «Тема выучена» без кнопки; серия запускается и возвращается к списку', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const progress = useProgressStore()
    const id = Object.keys(CATN).find(c => topicWords(c).length > 0)!
    const now = Date.now()
    for (const d of topicWords(id)) progress.data.words[d.k] = { ok: KNOWN_STREAK, bad: 0, streak: KNOWN_STREAK, last: now }
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const done = w.findAll('.wd-topic.done')
    expect(done.length).toBeGreaterThan(0)
    expect(done[0]!.text()).toContain('Тема выучена')
    expect(done[0]!.find('.wd-topic-go').exists()).toBe(false)
    expect(done[0]!.find('.pg-bar i').attributes('style')).toContain('100%')

    // у остальных тем кнопка запускает серию на TaskSession вместо списка слов
    const open = w.findAll('.wd-topic:not(.done) .wd-topic-go')
    expect(open.length).toBeGreaterThan(0)
    await open[0]!.trigger('click')
    expect(w.find('.wd-drill').exists()).toBe(true)
    expect(w.find('.wd-topics').exists()).toBe(false)
    expect(w.find('.tb').exists()).toBe(false)
    expect(w.findAll('.wd-drill button').length).toBeGreaterThan(3)

    await w.find('.wd-drill-head button').trigger('click')
    expect(w.find('.wd-drill').exists()).toBe(false)
    expect(w.find('.wd-topics').exists()).toBe(true)
    w.unmount()
  })
})
