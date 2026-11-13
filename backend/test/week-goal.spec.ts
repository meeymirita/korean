import { describe, expect, it } from 'vitest'
import { validWeekDays, validWeekOk, weekGoalLine, weekGoalOf, weekGoalResult } from '../src/study/week-goal'
import { StudyWeeklyService } from '../src/study/study-weekly.service'
import { renderWeeklyPdf } from '../src/study/weekly-pdf'

const day = (d: number, ok: number, bad = 0) => ({ day: `2026-11-${String(d).padStart(2, '0')}`, ok, bad })

describe('недельная цель на сервере', () => {
  it('границы и значения по умолчанию', () => {
    expect([validWeekDays(1), validWeekDays(7), validWeekDays(0), validWeekDays(8), validWeekDays(2.5), validWeekDays('3')]).toEqual([true, true, false, false, false, false])
    expect([validWeekOk(10), validWeekOk(1000), validWeekOk(9), validWeekOk(1001)]).toEqual([true, true, false, false])
    expect(weekGoalOf(undefined)).toEqual({ days: 5, ok: 100 })
    expect(weekGoalOf({ weekDays: 3, weekOk: 250 })).toEqual({ days: 3, ok: 250 })
    expect(weekGoalOf({ weekDays: 99 })).toEqual({ days: 5, ok: 100 })
  })

  it('неделя с понедельника: дни до него (отчёт идёт за семь суток) не считаются', () => {
    // воскресенье 15 ноября, лист за 9–15; для среды 11 ноября неделя началась в понедельник 9
    const rows = [day(8, 90, 5), day(9, 20), day(10, 0, 3), day(11, 30), day(12, 0)]
    expect(weekGoalResult(rows, { days: 5, ok: 100 })).toEqual({ days: 3, ok: 50, goalDays: 5, goalOk: 100, done: false })
    const full = [day(9, 30), day(10, 30), day(11, 30), day(12, 5), day(13, 6), day(14, 0), day(15, 0)]
    const r = weekGoalResult(full, { days: 5, ok: 100 })
    expect(r).toMatchObject({ days: 5, ok: 101, done: true })
    expect(weekGoalResult(full, { days: 5, ok: 150 }).done).toBe(false)
    expect(weekGoalResult([], { days: 5, ok: 100 })).toMatchObject({ days: 0, ok: 0, done: false })
  })

  it('строка отчёта', () => {
    expect(weekGoalLine({ days: 5, ok: 112, goalDays: 5, goalOk: 100, done: true })).toBe('Цель недели: выполнена · 5 из 5 дней, 112 из 100 верных')
    expect(weekGoalLine({ days: 3, ok: 64, goalDays: 5, goalOk: 100, done: false })).toBe('Цель недели: 3 из 5 дней, 64 из 100 верных')
  })

  it('сервис берёт цель из настроек в базе; битые настройки: по умолчанию; PDF с целью рисуется', async () => {
    const spec = { days: Array.from({ length: 7 }, (_, i) => ({ ...day(9 + i, i < 5 ? 30 : 0), seconds: 0 })) }
    const make = (v?: string) => new StudyWeeklyService({ getMeta: async () => v } as never, {} as never)
    expect(await make().goal(spec)).toMatchObject({ goalDays: 5, goalOk: 100, days: 5, ok: 150, done: true })
    expect(await make('{"weekDays":6,"weekOk":300}').goal(spec)).toMatchObject({ goalDays: 6, goalOk: 300, done: false })
    expect(await make('не json').goal(spec)).toMatchObject({ goalDays: 5, goalOk: 100 })
    const goal = await make().goal(spec)
    const pdf = await renderWeeklyPdf({ ...spec, modes: [], mistakes: [], mistakesTotal: 0, made: '15 ноября 2026 г., 20:00', goal })
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
