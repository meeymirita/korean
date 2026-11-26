import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PicCards from '@/components/korean/PicCards.vue'
import { STUDY } from '@/data/korean/study'
import { WORD_PICS } from '@/data/korean/word-pics'

describe('картинки к словам (проба)', () => {
  it('рисунки только к словам, которые уже есть в словаре заданий, без повторов', () => {
    const study = new Set(STUDY.map(w => w.k))
    const seen = new Set<string>()
    for (const p of WORD_PICS) {
      expect(study.has(p.k), p.k).toBe(true)
      expect(seen.has(p.k), `повтор ${p.k}`).toBe(false)
      seen.add(p.k)
      expect(p.svg.length).toBeGreaterThan(80)
      expect(p.svg).not.toMatch(/<script|onload|onerror|javascript:/i)
      // разметка правильная: без опечаток в тегах и кавычках (иначе рисунок не покажется)
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${p.svg}</svg>`, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), `разметка ${p.k}`).toBeNull()
    }
  })

  it('карточки рисуются все, нажатие переворачивает на слово и перевод, «Показать все» открывает остальные', async () => {
    const w = await mountSuspended(PicCards)
    const cards = w.findAll('.pc-card')
    expect(cards.length).toBe(WORD_PICS.length)
    expect(WORD_PICS.length).toBeGreaterThan(150)
    expect(cards[0]!.find('svg').exists()).toBe(true)
    expect(cards[0]!.classes()).not.toContain('open')
    await cards[0]!.trigger('click')
    expect(cards[0]!.classes()).toContain('open')
    expect(cards[0]!.find('.pc-back').text()).toContain(WORD_PICS[0]!.k)
    expect(cards[0]!.attributes('aria-pressed')).toBe('true')
    await w.find('.pc-all').trigger('click')
    expect(w.findAll('.pc-card.open').length).toBe(WORD_PICS.length)
    await w.find('.pc-all').trigger('click')
    expect(w.findAll('.pc-card.open').length).toBe(0)
  })

  it('поиск оставляет подходящие карточки по слову и по переводу', async () => {
    const w = await mountSuspended(PicCards)
    await w.find('.pc-q input').setValue('яблоко')
    expect(w.findAll('.pc-card').length).toBe(1)
    await w.find('.pc-q input').setValue('нет-такого-слова')
    expect(w.findAll('.pc-card').length).toBe(0)
    expect(w.find('.pc-none').exists()).toBe(true)
    await w.find('.pc-q input').setValue('')
    expect(w.findAll('.pc-card').length).toBe(WORD_PICS.length)
  })
})
