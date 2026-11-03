import { lastVisitOf } from '@/composables/useLastVisited'

/** Напоминание в колокольчике шапки раздела (`NotificationsBell.vue`). */
export interface Notice {
  id: string
  text: string
  to: string
}

/** Минимум данных из прогресса, нужный для расчёта напоминаний: сам стор не импортируем, чтобы не тянуть лишнее в тесты. */
export interface NoticeSource {
  unlocked: boolean
  sessionCreatedAt: number
}

const DISMISS_KEY = 'notice_dismiss'
/** Отложенное напоминание не всплывает снова это время, даже если условие ещё верно. */
const SNOOZE_MS = 3 * 86_400_000
const GARDEN_AFTER_MS = 7 * 86_400_000
const SESSION_WARN_MS = 3 * 86_400_000
/** держать в паре с SESSION_DAYS в backend/src/auth/twofa.service.ts */
export const SESSION_DAYS = 30

function readDismiss(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function snoozed(id: string, dismiss: Record<string, number>, now: number) {
  const at = dismiss[id]
  return !!at && now - at < SNOOZE_MS
}

/** Список действующих напоминаний: садик давно не открывали, сеанс двухфакторного входа скоро истечёт. */
export function computeNotices(progress: NoticeSource, now = Date.now()): Notice[] {
  if (!progress.unlocked) return []
  const dismiss = readDismiss()
  const out: Notice[] = []

  if (now - lastVisitOf('garden') > GARDEN_AFTER_MS && !snoozed('garden', dismiss, now)) {
    out.push({ id: 'garden', text: 'Давно не открывал Сад — загляни полить растения', to: '/korean/garden' })
  }

  if (progress.sessionCreatedAt) {
    const left = progress.sessionCreatedAt + SESSION_DAYS * 86_400_000 - now
    if (left > 0 && left < SESSION_WARN_MS && !snoozed('session', dismiss, now)) {
      const days = Math.max(1, Math.ceil(left / 86_400_000))
      out.push({ id: 'session', text: `Сеанс входа истекает через ${days} дн. — спросит код из письма заново`, to: '/korean/cabinet?tab=settings' })
    }
  }

  return out
}

/** Прячет напоминание на SNOOZE_MS: снова покажется, если условие всё ещё верно. */
export function dismissNotice(id: string) {
  const d = readDismiss()
  d[id] = Date.now()
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(d))
  } catch {
    /* ничего страшного */
  }
}
