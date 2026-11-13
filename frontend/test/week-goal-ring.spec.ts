import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import WeekGoalRing from '@/components/korean/WeekGoalRing.vue'
import { mondayOf } from '@/data/weeks'
import { dayKey, useProgressStore } from '@/stores/progress'

// Кольцо недельной цели на «Сегодня»: текст, доля, выполнение, настройки с границами.
const monday = () => dayKey(mondayOf(new Date()))

describe('WeekGoalRing', () => {
  it('показывает «N из M дней, K из L верных» по данным недели с понедельника и меняется с целью', async () => {
    const progress = useProgressStore()
    progress.data.days = { [monday()]: 64 }
    progress.data.all = { [monday()]: 80 }
    const w = await mountSuspended(WeekGoalRing)
    expect(w.text()).toContain('Неделя: 1 из 5 дней, 64 из 100 верных')
    expect(w.find('.wg').classes()).not.toContain('done')
    expect(w.findAll('.pg-bar i')).toHaveLength(2)
    expect(w.find('.wg-pct').text()).toBe('20%')

    progress.setSettings({ weekDays: 1, weekOk: 50 })
    await nextTick()
    expect(w.text()).toContain('Неделя: 1 из 1 дней, 64 из 50 верных')
    expect(w.find('.wg').classes()).toContain('done')
    expect(w.text()).toContain('Цель недели выполнена')
    expect(w.find('.wg-pct').text()).toBe('100%')
  })

  it('настройки недельной цели: границы, старые данные без полей', () => {
    const progress = useProgressStore()
    progress.setSettings({ weekDays: 3, weekOk: 250 })
    expect([progress.data.settings.weekDays, progress.data.settings.weekOk]).toEqual([3, 250])
    progress.setSettings({ weekDays: 8, weekOk: 5 })
    expect([progress.data.settings.weekDays, progress.data.settings.weekOk]).toEqual([3, 250])
    progress.setSettings({ weekDays: 2.5 })
    expect(progress.data.settings.weekDays).toBe(3)
  })
})
