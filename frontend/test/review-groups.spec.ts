import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ReviewView from '@/views/korean/ReviewView.vue'
import { CATN } from '@/data/korean/words'
import { PAIR_SETS, SETS, pool } from '@/data/korean/trainer'

// «Повторение»: в списке те же группы, что в «Найди пару» (темы словаря, наборы по грамматике, предложения).
describe('«Повторение»: выбор группы', () => {
  it('в списке все слова, темы словаря, «Грамматика» и «Предложения»', async () => {
    const w = await mountSuspended(ReviewView)
    const titles = w.findAll('select option').map(o => o.text())
    expect(titles).toEqual(['Все слова', ...Object.values(CATN), ...SETS.map(s => s.title), ...PAIR_SETS.map(s => s.title)])
    expect(w.findAll('select optgroup').map(g => g.attributes('label'))).toEqual(['Грамматика', 'Предложения'])
    w.unmount()
  })

  it('набор по грамматике даёт колоду из своих слов, у предложений нет звёздочки', async () => {
    const w = await mountSuspended(ReviewView)
    const select = w.find('select')
    await select.setValue('qwords')
    expect(w.find('.rv-count').text()).toBe(`1 / ${pool('qwords').length}`)
    expect(pool('qwords').map(x => x.k)).toContain(w.find('.rv-front .big').text())

    await select.setValue('qsent')
    expect(w.find('.rv-count').text()).toBe(`1 / ${pool('qsent').length}`)
    // спереди предложение с пропуском, сзади целое
    expect(w.find('.rv-front .big').text()).toContain('___')
    expect(w.find('.rv-back .big').text()).not.toContain('___')
    expect(w.find('.rv-front .big').classes()).toContain('long')
    expect(w.find('.rv-bottom').exists()).toBe(false)

    await select.setValue('sent')
    expect(w.find('.rv-count').text()).toBe(`1 / ${pool('sent').length}`)
    expect(w.find('.rv-bottom').exists()).toBe(false)

    await select.setValue('')
    expect(w.find('.rv-bottom').exists()).toBe(true)
    expect(w.find('.rv-front .big').classes()).not.toContain('long')
    w.unmount()
  })
})
