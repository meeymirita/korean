/** Типы и декораторы для входа по токену. */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'

/** pending: токен владельца верный, но защита требует ещё код из письма: доступны только шаги входа. */
export type Who = { role: 'owner'; pending?: true } | { role: 'guest'; id: string; expires: number }

/** Открытый маршрут (без токена), например /api/health. */
export const PUBLIC = 'public'
export const Public = () => SetMetadata(PUBLIC, true)

/** Только владелец: гостю такой маршрут отвечает 403. */
export const OWNER = 'owner'
export const Owner = () => SetMetadata(OWNER, true)

/** Маршрут доступен владельцу, который ещё не ввёл код из письма (шаги двухфакторного входа). */
export const ALLOW_PENDING = 'allow_pending'
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true)

/** Кто делает запрос: параметр метода контроллера `@CurrentWho() who: Who`. */
export const CurrentWho = createParamDecorator((_: unknown, ctx: ExecutionContext): Who => ctx.switchToHttp().getRequest().who)
