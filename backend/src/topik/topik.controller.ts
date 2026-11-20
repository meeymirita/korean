import { Body, Controller, Get, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { TopikService } from './topik.service.js'

/** /api/topik: результаты теста слов и пробников «Прогноза TOPIK I» (только владельцу). */
@Owner()
@Controller('topik')
export class TopikController {
  constructor(private readonly topik: TopikService) {}

  @Get()
  get() {
    return this.topik.get()
  }

  @Put()
  set(@Body() body: unknown) {
    return this.topik.set(body)
  }
}
