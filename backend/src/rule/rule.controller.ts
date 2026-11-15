import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { RuleService } from './rule.service.js'

/** /api/rule: настройки «Правила дня» (только владельцу). */
@Owner()
@Controller('rule')
export class RuleController {
  constructor(private readonly rule: RuleService) {}

  @Get()
  get() {
    return this.rule.status()
  }

  @Put()
  set(@Body() body: { enabled?: unknown; time?: unknown }) {
    return this.rule.set(body ?? {})
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.rule.test()
  }
}
