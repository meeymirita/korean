import { Controller, Get, Header } from '@nestjs/common'
import { Public } from './auth/auth.js'
import { MetricsService } from './metrics.service.js'

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render() { return this.metrics.render() }
}
