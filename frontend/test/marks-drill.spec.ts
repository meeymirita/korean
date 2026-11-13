import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import MarksView from '@/views/korean/MarksView.vue'
import { useProgressStore } from '@/stores/progress'
import { STUDY } from '@/data/korean/study'

// «Важное»: кнопка «Потренировать важные слова».
const goBtn = (w: Awaited<ReturnType<typeof mountSuspended>>) => w.find('.mk-go .rs-start')
const keys = STUDY.filter(d => /^[가-힣]+$/.test(d.k)).slice(0, 6).map(d => d.k)

describe('«Важное»: серия по важным словам', () => {
  it('меньше 4 слов: кнопка неактивна, есть подсказка', async () => {
    localStorage.clear()
    sessionStorage.clear()
    useProgressStore().data.settings.marks = keys.slice(0, 3).map(k => 'w:' + k)
    const w = await mountSuspended(MarksView, { route: '/korean/marks' })
    expect(goBtn(w).attributes('disabled')).toBeDefined()
    expect(w.find('.mk-hint').text()).toBe('Отметь хотя бы 4 слова звёздочкой')
    w.unmount()
  })

  it('от 4 слов: серия запускается, «← К списку» возвращает список', async () => {
    localStorage.clear()
    sessionStorage.clear()
    useProgressStore().data.settings.marks = keys.map(k => 'w:' + k)
    const w = await mountSuspended(MarksView, { route: '/korean/marks' })
    expect(goBtn(w).attributes('disabled')).toBeUndefined()
    await goBtn(w).trigger('click')
    expect(w.find('.mk-drill').exists()).toBe(true)
    expect(w.findAll('.rs-opt').length).toBeGreaterThanOrEqual(2)
    expect(w.find('.tb').exists()).toBe(false)
    const back = w.findAll('.mk-drill-head .chip').find(b => b.text() === '← К списку')!
    await back.trigger('click')
    expect(w.find('.mk-drill').exists()).toBe(false)
    expect(w.find('.tb').exists()).toBe(true)
    w.unmount()
  })
})
