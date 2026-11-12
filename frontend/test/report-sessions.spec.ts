import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import ReportSessions from '@/components/cabinet/ReportSessions.vue'
import type { ReportGroup } from '@/data/report'

const T = new Date(2026, 10, 12, 8, 20, 0).getTime()
const items = [
  { t: T, w: '작다', ok: false, source: 'trainer', mode: 'match', d: { q: '작다', a: 'маленький', y: 'мало', n: 'линией; соединено: «작다 чакта» и «мало»', r: 'one' } },
  { t: T + 5000, w: '적다', ok: true, source: 'trainer', mode: 'match', d: { q: '적다', a: 'мало', r: 'one' } },
  { t: T + 6000, w: '크다', ok: true, source: 'trainer', mode: 'match', d: { q: '크다', a: 'большой', r: 'two' } },
]
const groups: ReportGroup[] = [
  { source: 'trainer', name: 'Тренажёры', ok: 2, bad: 1, seconds: 10, rows: [{ source: 'trainer', mode: 'match', name: 'Найди пару', ok: 2, bad: 1, days: 1, first: T, last: T, seconds: 10 }] },
]

describe('отчёт: блок «Занятия»', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('показывает раунды отдельными занятиями и раскрывает ответы первого', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items, ok: 2, bad: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = await mountSuspended(ReportSessions, { props: { groups, days: 30 } })
    await flushPromises()

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/report/answers?days=30&limit=1000')
    const heads = wrapper.findAll('.rs-head')
    expect(heads).toHaveLength(2)
    expect(wrapper.text()).toContain('Найди пару · 3')
    // новое занятие сверху и раскрыто: в нём один верный ответ
    expect(heads[0]!.text()).toContain('1 отв.')
    expect(wrapper.findAll('.rs-tbl tbody tr')).toHaveLength(1)

    await heads[1]!.trigger('click')
    const rows = wrapper.findAll('.rs-tbl tbody tr')
    expect(rows).toHaveLength(3)
    const bad = rows.find(r => r.classes('bad'))!
    expect(bad.text()).toContain('작다')
    expect(bad.text()).toContain('маленький')
    expect(bad.text()).toContain('мало')
    expect(bad.text()).toContain('линией')
    wrapper.unmount()
  })
})
