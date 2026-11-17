import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import WordsView from '@/views/korean/WordsView.vue'
import { TENSES } from '@/data/korean/tenses'

const HAS = Object.keys(TENSES).length > 0

describe('страница «Слова»: три времени у глаголов и прилагательных', () => {
  it('колонки «Настоящее / Прошедшее / Будущее» есть, когда в tenses.ts есть слова', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const head = w.find('.row.h').text()
    expect(head.includes('Прошедшее')).toBe(HAS)
    expect(w.find('.tb').classes().includes('tn-on')).toBe(HAS)
  })

  it.skipIf(!HAS)('слово показывает свои три формы между «Корейский» и «Чтение»', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const k = Object.keys(TENSES)[0]!
    const row = w.findAll('.tb .row:not(.h)').find(r => r.find('.k').text() === k)!
    expect(row.findAll('.tn').map(x => x.text())).toEqual(TENSES[k]!.f)
  })

  it.skipIf(!HAS)('в раскрытом слове можно выбрать время: разбор берёт предложение и перевод этого времени', async () => {
    const w = await mountSuspended(WordsView, { route: '/korean/words' })
    const k = Object.keys(TENSES)[0]!
    const row = w.findAll('.tb .row:not(.h)').find(r => r.find('.k').text() === k)!
    await row.find('.se-btn').trigger('click')
    const chips = w.findAll('.tn-pick .chip')
    expect(chips.map(c => c.text())).toEqual(['Из списка', 'Настоящее', 'Прошедшее', 'Будущее'])
    await chips[3]!.trigger('click')
    const [ko, ru] = TENSES[k]!.s[2]
    expect(w.find('.bd-ko').text()).toBe(ko)
    expect(w.find('.bd-tr').text()).toContain(ru)
  })
})
