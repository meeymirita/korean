import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ExamView from '@/views/korean/ExamView.vue'
import { UNIT_OPEN_TOPICS, UNIT_QUESTIONS, buildUnitExam, units } from '@/data/korean/exam-units'
import { blitzBlocks, blockRules, examParts } from '@/data/korean/exam'

describe('экзамен единицы: данные', () => {
  const all = units()
  it('16 единиц: 1–8 книги 1A и 9–16 книги 1B, темы по порядку книги', () => {
    expect(all.filter(u => u.book === '1A').map(u => u.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(all.filter(u => u.book === '1B').map(u => u.n)).toEqual([9, 10, 11, 12, 13, 14, 15, 16])
    for (const u of all) expect(u.cards.length).toBeGreaterThan(0)
  })
  it('единица открыта, только если пройдено достаточно тем (3 или все, если их меньше); закрытые не дают вопросов', () => {
    for (const u of all) {
      const need = Math.min(UNIT_OPEN_TOPICS, u.cards.length)
      if (u.passed.length < need) expect(u.open).toBe(false)
    }
    expect(all.some(u => u.open)).toBe(true)
    expect(all.filter(u => u.book === '1B').every(u => !u.open)).toBe(true) // книга 1B ещё впереди
  })
  it('вопросы открытой единицы: до 20, верный ответ среди вариантов, без пустых', () => {
    for (const u of all.filter(x => x.open)) {
      const qs = buildUnitExam(u, all)
      expect(qs.length, u.id).toBeGreaterThanOrEqual(8)
      expect(qs.length).toBeLessThanOrEqual(UNIT_QUESTIONS)
      for (const q of qs) {
        expect(q.options).toContain(q.answer)
        expect(q.prompt.trim()).not.toBe('')
      }
    }
  })
})

describe('блиц: слабые правила идут вперёд', () => {
  it('с множеством слабых правил в набор чаще попадают блоки с ними', () => {
    const parts = examParts(4)
    const rule = blockRules(parts.flat().find(b => blockRules(b).length)!)[0]!
    const count = (weak?: Set<string>) => {
      let n = 0
      for (let i = 0; i < 40; i++) n += blitzBlocks(parts, 20, weak).filter(b => blockRules(b).includes(rule)).length
      return n
    }
    expect(count(new Set([rule]))).toBeGreaterThan(count())
  })
})

describe('страница «Экзамены»: вкладки', () => {
  it('четыре вкладки; адрес ?tab= выбирает нужную', async () => {
    const w = await mountSuspended(ExamView, { route: '/korean/exam?tab=units' })
    await flushPromises()
    const tabs = w.findAll('button.ex-tab')
    expect(tabs.map(t => t.find('b').text())).toEqual(['Блиц дня', 'Экзамен единицы', 'Большой экзамен', 'Пробник TOPIK I'])
    expect(tabs[1]!.classes()).toContain('on')
    expect(w.find('.units').exists()).toBe(true)
    expect(w.find('.tp').exists()).toBe(false)
  })
  it('вкладка TOPIK показывает пробник внутри, без своего заголовка', async () => {
    const w = await mountSuspended(ExamView, { route: '/korean/exam?tab=topik' })
    await flushPromises()
    expect(w.find('.tp').exists()).toBe(true)
    expect(w.findAll('.section-head, h1').some(h => h.text().includes('Прогноз TOPIK'))).toBe(false)
  })
})
