import { Controller, Get, Param, ParseIntPipe, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Owner } from '../auth/auth.js'
import { OpsService } from './ops.service.js'

/** Состояние инфраструктуры и журналы контейнеров; доступ только владельцу. */
@Owner()
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  /** GET /api/ops/services — статусы контейнеров текущего Compose-проекта. */
  @Get('services')
  services(@Req() req: Request) { return this.ops.services(!!req.headers['x-forwarded-for']) }

  /** GET /api/ops/logs/:service?tail=100 — stdout/stderr выбранного сервиса. */
  @Get('logs/:service')
  logs(@Param('service') service: string, @Query('tail', new ParseIntPipe({ optional: true })) tail?: number) {
    return this.ops.logs(service, tail)
  }
}
