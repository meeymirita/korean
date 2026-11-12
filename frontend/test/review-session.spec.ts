import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import ReviewView from '@/views/korean/ReviewView.vue'
import { useProgressStore } from '@/stores/progress'
import { NEW_NOTE } from '@/data/review'

// «Повторение»: раунд с кнопками «Помню / Не помню», порция из двух полей, итог в конце.
const setNum = async (w: Awaited<ReturnType<typeof mountSuspended>>, i: number, v: string) => {
  const input = w.findAll('.rv-num input')[i]!
  await input.setValue(v)
  await input.trigger('change')
}
const btn = (w: Awaited<ReturnType<typeof mountSuspended>>, cls: string) => w.find(`.rv-act ${cls}`)
const face = (w: Awaited<ReturnType<typeof mountSuspended>>) => w.find('.rv-front .big').text()

describe('«Повторение»: раунд «Помню / Не помню»', () => {
  it('два поля задают порцию: слов за раз и новых в день; числа помнятся', async () => {
    localStorage.clear()
    const w = await mountSuspended(ReviewView)
    expect(w.findAll('.rv-num input').map(i => (i.element as HTMLInputElement).value)).toEqual(['10', '5'])
    // по умолчанию 10 карточек: 5 новых и 5 на закрепление нет (ничего не отвечено), значит раунд из 5 новых
    expect(w.find('.rv-info').text()).toContain('5 новых')
    expect(w.find('.rv-count').text()).toBe('осталось 5')

    await setNum(w, 1, '3')
    expect(w.find('.rv-count').text()).toBe('осталось 3')
    await setNum(w, 0, '2')
    expect(w.find('.rv-count').text()).toBe('осталось 2')
    // вне границ: поправляется
    await setNum(w, 0, '999')
    expect((w.findAll('.rv-num input')[0]!.element as HTMLInputElement).value).toBe('50')
    expect(localStorage.getItem('rv_size')).toBe('50')
    expect(localStorage.getItem('rv_new')).toBe('3')
    w.unmount()

    const again = await mountSuspended(ReviewView)
    expect(again.findAll('.rv-num input').map(i => (i.element as HTMLInputElement).value)).toEqual(['50', '3'])
    again.unmount()
  })

  it('ответ доступен после переворота; «Не помню» возвращает карточку, в прогресс идёт только первый ответ', async () => {
    localStorage.clear()
    const progress = useProgressStore()
    const record = vi.spyOn(progress, 'record')
    const w = await mountSuspended(ReviewView)
    await setNum(w, 1, '2')
    expect(w.find('.rv-count').text()).toBe('осталось 2')
    record.mockClear()

    // до переворота кнопок ответа нет
    expect(btn(w, '.rv-yes').exists()).toBe(false)
    const first = face(w)
    await btn(w, 'button').trigger('click')
    expect(w.find('.rv-flip').classes()).toContain('flipped')
    await btn(w, '.rv-no').trigger('click')
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0]![0]).toMatchObject({ word: first, ok: false, source: 'review', mode: 'cards', detail: { q: first, y: 'не помню', n: NEW_NOTE } })
    // карточка не ушла: осталось по-прежнему две, на экране вторая, лицом
    expect(w.find('.rv-count').text()).toBe('осталось 2')
    expect(w.find('.rv-flip').classes()).not.toContain('flipped')
    const second = face(w)
    expect(second).not.toBe(first)

    await btn(w, 'button').trigger('click')
    await btn(w, '.rv-yes').trigger('click')
    expect(record).toHaveBeenCalledTimes(2)
    expect(w.find('.rv-count').text()).toBe('осталось 1')
    // вернулась первая; её повторный ответ очков не меняет
    expect(face(w)).toBe(first)
    await btn(w, 'button').trigger('click')
    await btn(w, '.rv-yes').trigger('click')
    await nextTick()
    expect(record).toHaveBeenCalledTimes(2)

    // итог: с первого раза одна из двух
    expect(w.find('.rv-score').text()).toBe('1 из 2')
    expect(w.find('.rv-prog i').attributes('style')).toContain('100%')
    // новых на сегодня больше нет (2 из 2), оба слова уже отвечены и ждут срока: следующий раунд из закрепления и тех, что пора
    await btn(w, 'button').trigger('click')
    expect(w.find('.rv-info').text()).toContain('0 новых')
    w.unmount()
  })

  it('клавиши: пробел переворачивает, 1 и 2 отвечают только после переворота', async () => {
    localStorage.clear()
    const w = await mountSuspended(ReviewView)
    const before = w.find('.rv-count').text()
    const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
    key('1')
    await nextTick()
    expect(w.find('.rv-count').text()).toBe(before)
    key(' ')
    await nextTick()
    expect(w.find('.rv-flip').classes()).toContain('flipped')
    key('1')
    await nextTick()
    expect(w.find('.rv-count').text()).not.toBe(before)
    w.unmount()
  })
})
