/** Архив приходит каждый день сам; если последнего нет дольше этого срока (3 дня), кабинет напоминает. */
export const ARCHIVE_STALE_MS = 3 * 86_400_000

export interface ArchiveStamp {
  ok: boolean
  time: number
}

/**
 * Нужно ли напомнить про архив. `problems` непустой (нет пароля или почты): напоминать про архив рано, там своя подсказка.
 * Возвращает текст или пустую строку.
 */
export function archiveReminder(last: ArchiveStamp | null, problems: string[], now = Date.now()): string {
  if (problems.length) return ''
  if (!last) return 'Полный архив ещё ни разу не отправлялся. Нажмите «Сделать архив и отправить».'
  const okTime = last.ok ? last.time : 0
  if (okTime && now - okTime <= ARCHIVE_STALE_MS) return ''
  const days = okTime ? Math.floor((now - okTime) / 86_400_000) : 0
  return okTime
    ? `Архив не приходил на почту уже ${days} дн. Сервер собирает его каждый день сам: проверьте почту и «Настройки».`
    : 'Последний архив не удалось отправить. Посмотрите причину в «Настройках».'
}
