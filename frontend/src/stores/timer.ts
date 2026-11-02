import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { dayKey, useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Секунды уходят в базу не чаще раза в это время и при остановке. */
const FLUSH_EVERY = 30
/** Если вкладка «засыпала», за один шаг засчитывается не больше стольких секунд. */
const MAX_STEP = 10
/** Как часто напоминать про таймер, пока он не запущен (мс). */
export const REMIND_EVERY = 10 * 60 * 1000
export const FIRST_REMIND = 15 * 1000

/** «1:05» или «1:02:11». */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** «1 ч 05 мин» для сводки в кабинете. */
export function formatSpent(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 1) return sec > 0 ? 'меньше минуты' : '0 мин'
  const h = Math.floor(m / 60)
  return h ? `${h} ч ${String(m % 60).padStart(2, '0')} мин` : `${m} мин`
}

/**
 * Таймер занятий: включается кнопкой, а не сам. Время идёт в прогресс (таблица study_time в базе) и показывается в кабинете.
 * Гостю и без токена таймер не нужен: ему ничего не сохраняется.
 */
export const useTimerStore = defineStore('timer', () => {
  const progress = useProgressStore()
  const toast = useToastStore()
  const running = ref(false)
  /** секунд в текущем запуске */
  const session = ref(0)
  /** секунд, ещё не записанных в прогресс */
  const pending = ref(0)
  const reminder = ref(false)
  let tick: ReturnType<typeof setInterval> | undefined
  let remindTimer: ReturnType<typeof setInterval> | undefined
  let last = 0
  let lastRemind = 0

  const available = computed(() => progress.unlocked && !progress.isGuest)
  /** сегодня всего, с учётом ещё не записанных секунд */
  const today = computed(() => (progress.data.time[dayKey()] ?? 0) + pending.value)

  function flush() {
    if (pending.value >= 1) {
      progress.addTime(pending.value)
      pending.value = 0
    }
  }

  function step() {
    const now = Date.now()
    const d = Math.min(MAX_STEP, Math.round((now - last) / 1000))
    last = now
    if (d < 1) return
    session.value += d
    pending.value += d
    if (pending.value >= FLUSH_EVERY) flush()
  }

  function start() {
    if (running.value || !available.value) return
    running.value = true
    reminder.value = false
    last = Date.now()
    tick = setInterval(step, 1000)
    toast.ok('Таймер запущен')
  }

  function stop() {
    if (!running.value) return
    step()
    clearInterval(tick)
    running.value = false
    flush()
    toast.info(`Таймер остановлен · ${formatClock(session.value)}`)
  }

  function toggle() {
    if (running.value) stop()
    else start()
  }

  function dismiss() {
    reminder.value = false
    lastRemind = Date.now()
  }

  /** Напоминание в углу: первый раз вскоре после входа, потом раз в REMIND_EVERY, пока таймер не запущен. */
  function watchReminder() {
    clearInterval(remindTimer)
    lastRemind = Date.now() - REMIND_EVERY + FIRST_REMIND
    remindTimer = setInterval(() => {
      if (!available.value) {
        if (running.value) stop()
        reminder.value = false
        return
      }
      if (!running.value && !reminder.value && Date.now() - lastRemind >= REMIND_EVERY) {
        reminder.value = true
        lastRemind = Date.now()
      }
    }, 5000)
    window.removeEventListener('pagehide', flushOnLeave) // повторный вызов (горячая перезагрузка) не плодит обработчики
    window.addEventListener('pagehide', flushOnLeave)
  }
  function flushOnLeave() {
    if (running.value) step()
    flush()
  }

  return { running, session, today, reminder, available, start, stop, toggle, dismiss, watchReminder }
})
