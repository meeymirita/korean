import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { DigestService } from './digest.service'

/** /api/digest: настройки письма-подборки (только владельцу). */
@Owner()
@Controller('digest')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @Get()
  get() {
    return this.digest.status()
  }

  @Put()
  set(@Body() body: { enabled?: unknown; time?: unknown; words?: unknown; sentences?: unknown }) {
    return this.digest.set(body ?? {})
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.digest.test()
  }
}
