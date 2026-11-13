import { describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import ExamRun from '@/components/korean/ExamRun.vue'
import { examParts } from '@/data/korean/exam'

// Экзамен: предупреждение браузера о несохранённых ответах (beforeunload).
const fire = () => {
  const e = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

describe('ExamRun: несохранённые ответы', () => {
  it('предупреждает только когда есть ответы, и снимается после release и размонтирования', async () => {
    const blocks = examParts()[0]!
    const w = await mountSuspended(ExamRun, { props: { blocks, part: 1, parts: 4 } })
    expect(fire()).toBe(false)
    const sel = w.element.querySelector<HTMLSelectElement>('select')
    const input = w.element.querySelector<HTMLInputElement>('input.er-form, input.er-gap')
    if (sel) {
      sel.value = [...sel.options].find(o => o.value)!.value
      sel.dispatchEvent(new Event('change'))
    } else input!.dispatchEvent(new Event('input'))
    if (!sel) {
      input!.value = 'ㅎ'
      input!.dispatchEvent(new Event('input'))
    }
    await nextTick()
    expect(fire()).toBe(true)
    ;(w.vm as unknown as { release: () => void }).release()
    expect(fire()).toBe(false)
    w.unmount()

    const w2 = await mountSuspended(ExamRun, { props: { blocks, part: 1, parts: 4 } })
    const rm = vi.spyOn(window, 'removeEventListener')
    w2.unmount()
    expect(rm).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })
})
