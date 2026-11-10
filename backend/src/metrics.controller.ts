import { Controller, Get, Header, NotFoundException, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from './auth/auth.js'
import { ContainerMetrics } from './container-metrics.service.js'
import { MetricsService } from './metrics.service.js'
import { isInternal } from './security.js'

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly containers: ContainerMetrics,
  ) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  /** Метрики читает только Prometheus из внутренней сети: запрос через внешний Caddy (с X-Forwarded-For) или не с частного адреса получает 404. */
  render(@Req() req: Request) {
    if (!isInternal(req)) throw new NotFoundException()
    return this.metrics.render() + this.containers.render()
  }
}
