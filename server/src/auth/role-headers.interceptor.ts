import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'

/** Роль и срок гостя уходят в заголовках X-Role и X-Guest-Expires: сайту нужно знать, что гостю ничего не сохраняется. */
@Injectable()
export class RoleHeadersInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const http = ctx.switchToHttp()
    const who = http.getRequest().who
    if (who) {
      const res = http.getResponse()
      res.setHeader('X-Role', who.role)
      if (who.role === 'guest') res.setHeader('X-Guest-Expires', String(who.expires))
    }
    return next.handle()
  }
}
