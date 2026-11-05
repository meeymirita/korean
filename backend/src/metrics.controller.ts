import { Controller, Get, Header, NotFoundException, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from './auth/auth.js'
import { MetricsService } from './metrics.service.js'

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  /** Метрики читает только Prometheus из внутренней сети: запрос через внешний Caddy (с X-Forwarded-For) получает 404. */
  render(@Req() req: Request) {
    if (req.headers['x-forwarded-for']) throw new NotFoundException()
    return this.metrics.render()
  }
}
