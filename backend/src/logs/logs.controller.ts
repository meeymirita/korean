import { Controller, Get, Query } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { LogsService } from './logs.service'

/** /api/logs: журналы сервера и Caddy, только для владельца (вкладка «Журналы» в кабинете). */
@Owner()
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get('app')
  app(@Query('limit') limit?: string, @Query('level') level?: string, @Query('q') q?: string) {
    return this.logs.app(limit, level, q)
  }

  @Get('caddy')
  caddy(@Query('limit') limit?: string, @Query('level') level?: string, @Query('q') q?: string) {
    return this.logs.caddy(limit, level, q)
  }
}
