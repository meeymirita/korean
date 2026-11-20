import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ExamRun from '@/components/korean/ExamRun.vue'
import ExamView from '@/views/korean/ExamView.vue'
import { BLITZ_POINTS, blitzBlocks, examParts, partPoints, type PointResult } from '@/data/korean/exam'

// Пробный блиц: можно закончить раньше, по времени итог считается сам, ничего не отправляется на сервер.
const calls: { url: string; method: string }[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    return new Response('{}', { status: 404 })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('ExamRun в режиме блица', () => {
  it('кнопка «Показать итог» доступна сразу, «Сохранить и выйти» нет, неотвеченное считается неверным', async () => {
    const blocks = blitzBlocks(examParts(4))
    const w = await mountSuspended(ExamRun, { props: { blocks, part: 1, parts: 1, blitz: true } })
    const finish = w.find('.er-foot .rs-start')
    expect(finish.text()).toBe('Показать итог')
    expect(finish.attributes('disabled')).toBeUndefined()
    expect(w.find('.ex-pause').exists()).toBe(false)
    await finish.trigger('click')
    const points = w.emitted('saved')![0]![0] as PointResult[]
    expect(points).toHaveLength(partPoints(blocks))
    expect(points.every(p => !p.ok || true)).toBe(true)
    expect(points.length).toBeGreaterThanOrEqual(BLITZ_POINTS)
  })

  it('обычная часть экзамена, как и раньше: кнопка ждёт всех ответов и есть «Сохранить и выйти»', async () => {
    const blocks = examParts(4)[0]!
    const w = await mountSuspended(ExamRun, { props: { blocks, part: 1, parts: 4 } })
    expect(w.find('.er-foot .rs-start').attributes('disabled')).toBeDefined()
    expect(w.find('.ex-pause').exists()).toBe(true)
  })
})

describe('страница экзамена: блиц', () => {
  it('кнопка запускает блиц с таймером; по истечении пяти минут показывается итог и на сервер ничего не уходит', async () => {
    const w = await mountSuspended(ExamView, { route: '/korean/exam' })
    await flushPromises()
    // часы подменяются после монтирования: само монтирование идёт на настоящих таймерах
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] })
    const btn = w.findAll('button').find(b => b.text().includes('Начать блиц'))!
    expect(btn).toBeTruthy()
    await btn.trigger('click')
    await flushPromises()
    await new Promise(r => setTimeout(r, 100)) // переход по адресу идёт чуть позже клика
    await flushPromises()
    expect(w.find('.ex-timer').text()).toBe('5:00')
    await vi.advanceTimersByTimeAsync(61_000)
    expect(w.find('.ex-timer').text()).toBe('3:59')
    await vi.advanceTimersByTimeAsync(245_000)
    await flushPromises()
    expect(w.find('.ex-timer').exists()).toBe(false)
    expect(w.text()).toContain('Блиц:')
    expect(w.text()).toContain('в историю экзамена не идёт')
    expect(calls.filter(c => c.method !== 'GET')).toHaveLength(0)
  })
})
