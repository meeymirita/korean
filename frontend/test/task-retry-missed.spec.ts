import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import TaskSession from '@/components/korean/TaskSession.vue'
import type { Task } from '@/data/korean/tasks'

// Итог серии: «Ещё раз ошибки этой серии» повторяет только неверно решённые задания.
const mk = (id: number): Task => ({ id, kind: 'tr', title: 'Тест', prompt: `вопрос ${id}`, options: ['A', 'B'], answer: 'A' })
type W = Awaited<ReturnType<typeof mountSuspended>>

/** Проходит серию до итога: на задания из `wrong` всегда отвечает неверно, на остальные верно. */
async function play(w: W, wrong: number[]) {
  for (let guard = 0; guard < 40 && !w.find('.rs-end').exists(); guard++) {
    const id = Number(w.find('.rs-q').text().replace('вопрос ', ''))
    const opt = w.findAll('.rs-opt').find(b => b.text().includes(wrong.includes(id) ? 'B' : 'A'))!
    await opt.trigger('click')
    await w.find('.rs-next').trigger('click')
  }
}
const retryBtn = (w: W) => w.findAll('.pg-btns button').find(b => b.text() === 'Ещё раз ошибки этой серии')

describe('TaskSession: ещё раз ошибки серии', () => {
  it('кнопки нет, если всё верно', async () => {
    const w = await mountSuspended(TaskSession, { props: { tasks: [mk(1), mk(2), mk(3)], source: 'test' } })
    await play(w, [])
    expect(w.find('.rs-end').exists()).toBe(true)
    expect(retryBtn(w)).toBeUndefined()
    w.unmount()
  })

  it('повторяет только неверные задания, итог считается от их числа', async () => {
    const w = await mountSuspended(TaskSession, { props: { tasks: [mk(1), mk(2), mk(3)], source: 'test' } })
    await play(w, [2, 3])
    expect(w.find('.pg-v').text()).toContain('из 3')
    expect(w.findAll('.qk-miss li')).toHaveLength(2)
    const btn = retryBtn(w)!
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    expect(w.find('.rs-end').exists()).toBe(false)
    expect(w.find('.rs-bar').text()).toContain('1 из 2')
    await play(w, [])
    expect(w.find('.pg-v').text()).toContain('2')
    expect(w.find('.pg-v').text()).toContain('из 2')
    expect(retryBtn(w)).toBeUndefined()
    w.unmount()
  })
})
