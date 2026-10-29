import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { CurrentWho, Who } from '../auth/auth'
import { ProgressService } from './progress.service'

/** Гость прогресс не видит и не сохраняет: ему пустой ответ, а его действия игнорируются. */
@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /** GET /api/progress: весь прогресс владельца. */
  @Get('progress')
  read(@CurrentWho() who: Who) {
    return who.role === 'guest' ? {} : this.progress.read()
  }

  /** POST /api/ops: пачка действий { ops: [{ type: 'answer' | 'reset' | 'profile' | 'settings' | 'import', … }] }. */
  @Post('ops')
  @HttpCode(200)
  ops(@CurrentWho() who: Who, @Body() body: unknown) {
    if (who.role === 'guest') return { ok: true, guest: true }
    return this.progress.apply(body)
  }
}
