import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'

/** Ошибки клиента из разбора тела запроса (слишком большое, не JSON) отдаём коротким ответом и не пишем в лог как ошибки сервера. */
@Catch()
export class ErrorFilter extends BaseExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const err = e as { status?: number; type?: string }
    if (!(e instanceof HttpException) && typeof err?.status === 'number' && err.status < 500) {
      const error = err.type === 'entity.too.large' ? 'too large' : err.type === 'entity.parse.failed' ? 'invalid json' : 'bad request'
      return host.switchToHttp().getResponse().status(err.status).json({ error })
    }
    super.catch(e, host)
  }
}
