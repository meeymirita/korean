import { after, afterEach, beforeEach, describe, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { offline } from './_helpers.mjs'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
globalThis.window ??= globalThis
for (const m of ['addEventListener', 'removeEventListener']) globalThis.window[m] ??= () => {}
const { useTimerStore, formatClock, formatSpent } = await load('/src/stores/timer.ts')
const { useProgressStore, dayKey } = await load('/src/stores/progress.ts')
const { useToastStore } = await load('/src/stores/toast.ts')
after(close)

const realFetch = globalThis.fetch
let timer, progress, toast
/** Время идёт по секунде (так ведёт себя настоящий браузер): одним большим прыжком таймер засчитал бы не больше 10 секунд. */
const run = sec => {
  for (let i = 0; i < sec; i++) mock.timers.tick(1000)
}

function fresh(who = 'owner') {
  ls.clear()
  if (who === 'owner') (ls.set('progress_token', 't'), ls.set('progress_verified', '1'))
  if (who === 'guest') (ls.set('progress_token', 't'), ls.set('progress_verified', '1'), ls.set('progress_role', 'guest'))
  setActivePinia(createPinia())
  progress = useProgressStore()
  toast = useToastStore()
  timer = useTimerStore()
}
beforeEach(() => {
  globalThis.fetch = offline
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 1_800_000_000_000 })
  fresh()
})
afterEach(() => {
  timer.stop()
  progress.disconnect()
  mock.timers.reset()
  globalThis.fetch = realFetch
})

describe('форматы времени', () => {
  test('часы: минуты и секунды, а с часа ещё и часы', () => {
    assert.equal(formatClock(0), '0:00')
    assert.equal(formatClock(65), '1:05')
    assert.equal(formatClock(3725), '1:02:05')
    assert.equal(formatClock(-5), '0:00')
  })

  test('сводка для кабинета', () => {
    assert.equal(formatSpent(0), '0 мин')
    assert.equal(formatSpent(20), 'меньше минуты')
    assert.equal(formatSpent(25 * 60), '25 мин')
    assert.equal(formatSpent(3900), '1 ч 05 мин')
  })
})

describe('таймер занятий', () => {
  test('сам не включается, кнопка включает и выключает', () => {
    assert.equal(timer.running, false)
    timer.start()
    assert.equal(timer.running, true)
    timer.toggle()
    assert.equal(timer.running, false)
  })

  test('секунды идут в прогресс: раз в 30 секунд и при остановке, а на экране считаются сразу', () => {
    timer.start()
    run(10)
    assert.equal(timer.session, 10)
    assert.equal(timer.today, 10)
    assert.equal(progress.data.time[dayKey()] ?? 0, 0, 'ещё не записано')
    run(20)
    assert.equal(progress.data.time[dayKey()], 30, 'записалось на 30-й секунде')
    run(5)
    timer.stop()
    assert.equal(progress.data.time[dayKey()], 35, 'остаток записался при остановке')
    assert.equal(timer.today, 35)
  })

  test('гостю и без токена таймер недоступен и ничего не пишет', () => {
    fresh('guest')
    timer.start()
    assert.equal(timer.running, false)
    progress.disconnect() // выходит из гостевого режима
    fresh('none')
    timer.start()
    assert.equal(timer.running, false)
    assert.equal(timer.available, false)
  })

  test('плашки: запуск и остановка с итогом', () => {
    timer.start()
    assert.deepEqual(toast.items.map(i => i.text), ['Таймер запущен'])
    run(7)
    timer.stop()
    assert.equal(toast.items.at(-1).text, 'Таймер остановлен · 0:07')
  })

  test('напоминание показывается, пока таймер не запущен, и пропадает после запуска', () => {
    timer.watchReminder()
    run(20)
    assert.equal(timer.reminder, true)
    timer.dismiss()
    assert.equal(timer.reminder, false)
    run(60)
    assert.equal(timer.reminder, false, 'после закрытия не появляется сразу снова')
    mock.timers.tick(10 * 60_000)
    assert.equal(timer.reminder, true, 'но возвращается через 10 минут')
    timer.start()
    assert.equal(timer.reminder, false)
  })
})
