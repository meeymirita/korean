/** Типы и декораторы для входа по токену. */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'

export type Who = { role: 'owner' } | { role: 'guest'; id: string; expires: number }

/** Открытый маршрут (без токена), например /api/health. */
export const PUBLIC = 'public'
export const Public = () => SetMetadata(PUBLIC, true)

/** Только владелец: гостю такой маршрут отвечает 403. */
export const OWNER = 'owner'
export const Owner = () => SetMetadata(OWNER, true)

/** Кто делает запрос: параметр метода контроллера `@CurrentWho() who: Who`. */
export const CurrentWho = createParamDecorator((_: unknown, ctx: ExecutionContext): Who => ctx.switchToHttp().getRequest().who)
