import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VlogTest from '@/components/korean/VlogTest.vue'
import VlogGrammarList from '@/components/korean/VlogGrammarList.vue'
import { VLOGS } from '@/data/korean/vlogs'
import { passes } from '@/data/korean/vlog-study'
import { VLOG_TEST } from '@/data/korean/vlog-test'

// Тест по влогу: четыре блока одним заходом, итог и событие `finish`; вкладка «Грамматика из влогов».
afterEach(() => vi.unstubAllGlobals())

const first = passes(VLOGS.find(v => v.id === 'choisusu-hobby')!.lines).first
const words = Array.from({ length: 10 }, (_, i) => ({ k: `слово${i}`, t: `значение${i}` }))

describe('Тест по влогу', () => {
  it('проходит все четыре блока и отдаёт общий итог', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    const w = await mountSuspended(VlogTest, { props: { vlogId: 'choisusu-hobby', lines: first, words } })
    await w.find('.vt-btn.main').trigger('click')

    // 1. вопросы: 8 из банка, у каждого четыре варианта
    expect(w.findAll('.vt-q').length).toBe(8)
    expect(w.findAll('.vt-q')[0]!.findAll('.vt-opt').length).toBe(4)
    for (const q of w.findAll('.vt-q')) await q.findAll('.vt-opt')[0]!.trigger('click')
    await w.find('.vt-btn.main').trigger('click')

    // 2. слова: соединить русское и корейское, дальше только когда всё соединено
    expect(w.find('.vt-btn.main').attributes('disabled')).toBeDefined()
    for (const p of words) {
      await w.findAll('.vt-col')[0]!.findAll('.vt-w').find(b => b.text() === p.t)!.trigger('click')
      await w.findAll('.vt-col')[1]!.findAll('.vt-w').find(b => b.text() === p.k)!.trigger('click')
    }
    expect(w.find('.vt-btn.main').attributes('disabled')).toBeUndefined()
    await w.find('.vt-btn.main').trigger('click')

    // 3. рассказ: слово нажатием в пропуск, нажатие на заполненный пропуск возвращает слово
    const gaps = VLOG_TEST['choisusu-hobby']!.story.gaps
    await w.find(`.vt-tile[data-w="${gaps[0]}"]`).trigger('click')
    await w.find('.vt-gap[data-g="0"]').trigger('click')
    expect(w.find('.vt-gap[data-g="0"]').text()).toBe(gaps[0])
    await w.find('.vt-gap[data-g="0"]').trigger('click')
    expect(w.find('.vt-gap[data-g="0"]').text()).not.toBe(gaps[0])
    for (let g = 0; g < gaps.length; g++) {
      await w.find(`.vt-tile[data-w="${gaps[g]}"]`).trigger('click')
      await w.find(`.vt-gap[data-g="${g}"]`).trigger('click')
    }
    await w.find('.vt-btn.main').trigger('click')

    // 4. порядок: кнопка «выше» двигает событие
    const before = w.findAll('.vt-et').map(e => e.text())
    await w.findAll('.vt-ev')[1]!.findAll('.vt-mv')[0]!.trigger('click')
    expect(w.findAll('.vt-et')[0]!.text()).toBe(before[1])
    await w.find('.vt-btn.main').trigger('click')
    await flushPromises()

    // итог: рассказ собран верно, общий максимум 8 + 10 + 6 + 6
    const done = w.emitted('finish')![0]![0] as { score: number; total: number; blocks: { id: string; score: number; total: number }[] }
    expect(done.total).toBe(30)
    expect(done.blocks.find(b => b.id === 'story')).toMatchObject({ score: gaps.length, total: gaps.length })
    expect(done.blocks.find(b => b.id === 'words')).toMatchObject({ score: 10, total: 10 })
    expect(w.find('.vt-res').exists()).toBe(true)
  })

  it('влога без заданий: «готовятся»', async () => {
    const w = await mountSuspended(VlogTest, { props: { vlogId: 'bukchon', lines: [], words: [] } })
    expect(w.text()).toContain('готовятся')
  })
})

describe('Вкладка «Грамматика из влогов»', () => {
  it('общий список тем со статусом, числом фраз и справками', async () => {
    const w = await mountSuspended(VlogGrammarList)
    const heads = w.findAll('.vg-head b').map(b => b.text())
    expect(heads.length).toBeGreaterThan(10)
    expect(heads.some(h => h.includes('-고'))).toBe(true)
    expect(heads.some(h => h.includes('-는 것'))).toBe(true)
    expect(w.text()).toContain('нигде не записывается')
    // фильтр по статусу сужает список
    const all = w.findAll('.vg-row').length
    const chip = w.findAll('.vg-chip').find(c => c.text().startsWith('ещё впереди'))
    if (chip) {
      await chip.trigger('click')
      expect(w.findAll('.vg-row').length).toBeLessThan(all)
    }
  })
})
