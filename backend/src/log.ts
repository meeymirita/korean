import { Logger } from '@nestjs/common'

/**
 * Сообщения сервисов об ошибках и предупреждениях: идут через Logger Nest (время, уровень, метка «App»),
 * как и остальной журнал приложения. `console.*` остаётся только в `main.ts` (до запуска Nest)
 * и в `dict.service.ts` для двух строк уровня log, который у Nest выключен.
 */
const logger = new Logger('App')
const text = (parts: unknown[]) => parts.map(p => (p instanceof Error ? p.message : String(p))).join(' ')

export const logError = (...parts: unknown[]) => logger.error(text(parts))
export const logWarn = (...parts: unknown[]) => logger.warn(text(parts))
