/**
 * Даты достижений: когда бейдж в «Твой путь» (OverviewTab.vue) стал выполнен. Хранится только в этом браузере
 * (не синхронизируется с сервером — как тема или режим «только задание»): сама отметка «выполнено» и так
 * считается от данных с сервера, здесь только дата первого раза, когда это увидели на этом устройстве.
 */
const KEY = 'achieved_dates'

function read(): Record<string, number> {
  if (import.meta.server) return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** Дата первого достижения (мс) или null, если ещё не отмечена на этом устройстве. */
export function achievedAt(id: string): number | null {
  return read()[id] ?? null
}

/** Запоминает дату первого достижения, если её ещё не было. */
export function markAchieved(id: string) {
  if (import.meta.server) return
  const d = read()
  if (d[id]) return
  d[id] = Date.now()
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* ничего страшного */
  }
}
