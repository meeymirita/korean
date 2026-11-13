import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import OverviewTab from '@/components/cabinet/OverviewTab.vue'
import { useProgressStore } from '@/stores/progress'
import { STUDY } from '@/data/korean/study'
import { CATN } from '@/data/korean/words'

// «Обзор»: фильтр слабых слов по теме и список «Давно не видел».
const DAY = 86_400_000
type W = Awaited<ReturnType<typeof mountSuspended>>
const settle = async (w: W) => {
  await nextTick()
  await nextTick()
  return w
}

describe('«Обзор»: слабые слова по теме', () => {
  it('выбор темы оставляет слова только этой темы, «Все» возвращает остальные', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const p = useProgressStore()
    const topic = Object.keys(CATN).find(id => STUDY.some(d => d.c.includes(id)) && STUDY.some(d => !d.c.includes(id)))!
    const inT = STUDY.find(d => d.c.includes(topic))!
    const outT = STUDY.find(d => !d.c.includes(topic))!
    p.data.words[inT.k] = { ok: 0, bad: 3, streak: 0, last: Date.now() }
    p.data.words[outT.k] = { ok: 0, bad: 2, streak: 0, last: Date.now() }
    const w = await settle(await mountSuspended(OverviewTab))
    const shown = () => w.findAll('.pg-w b').map(b => b.text())
    expect(shown()).toContain(inT.k)
    expect(shown()).toContain(outT.k)
    await w.find('.pg-filter select').setValue(topic)
    expect(shown()).toContain(inT.k)
    expect(shown()).not.toContain(outT.k)
    await w.find('.pg-filter select').setValue('')
    expect(shown()).toContain(outT.k)
    w.unmount()
  })
})

describe('«Обзор»: «Давно не видел»', () => {
  it('нет давних слов: блока нет; слова без ответов в список не попадают', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const p = useProgressStore()
    p.data.words[STUDY[0]!.k] = { ok: 1, bad: 0, streak: 1, last: Date.now() - 5 * DAY }
    const w = await settle(await mountSuspended(OverviewTab))
    expect(w.find('.pg-stale').exists()).toBe(false)
    w.unmount()
  })

  it('20 строк, «Показать ещё», самые давние первыми, серия на TaskSession и возврат к списку', async () => {
    localStorage.clear()
    sessionStorage.clear()
    const p = useProgressStore()
    const now = Date.now()
    STUDY.slice(0, 25).forEach((d, i) => (p.data.words[d.k] = { ok: 1, bad: 0, streak: 1, last: now - (40 + i) * DAY }))
    const w = await settle(await mountSuspended(OverviewTab))
    expect(w.find('.pg-stale').exists()).toBe(true)
    const rows = () => w.findAll('.pg-stale-row')
    expect(rows().length).toBe(20)
    expect(rows()[0]!.text()).toContain(STUDY[24]!.k)
    expect(rows()[0]!.text()).toContain('очки 1')
    await w.findAll('.pg-stale-act .chip').find(b => b.text().startsWith('Показать ещё'))!.trigger('click')
    expect(rows().length).toBe(25)
    expect(w.findAll('.pg-stale-act .chip').some(b => b.text().startsWith('Показать ещё'))).toBe(false)

    await w.find('.pg-stale-go').trigger('click')
    expect(w.find('.pg-stale-list').exists()).toBe(false)
    expect(w.findAll('.pg-stale button').length).toBeGreaterThan(3)
    await w.find('.pg-stale > .chip').trigger('click')
    expect(w.find('.pg-stale-list').exists()).toBe(true)
    w.unmount()
  })
})
