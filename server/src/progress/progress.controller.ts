import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { CurrentWho, Who } from '../auth/auth'
import { ConfirmService } from '../auth/confirm.service'
import { ProgressService } from './progress.service'

/** Гость прогресс не видит и не сохраняет: ему пустой ответ, а его действия игнорируются. */
@Controller()
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly confirm: ConfirmService,
  ) {}

  /** GET /api/progress: весь прогресс владельца. */
  @Get('progress')
  read(@CurrentWho() who: Who) {
    return who.role === 'guest' ? {} : this.progress.read()
  }

  /** POST /api/ops: пачка действий { ops: [{ type: 'answer' | 'reset' | 'profile' | 'settings' | 'import', … }] }. */
  @Post('ops')
  @HttpCode(200)
  ops(@CurrentWho() who: Who, @Req() req: Request, @Body() body: unknown) {
    if (who.role === 'guest') return { ok: true, guest: true }
    // сброс прогресса и загрузка копии стирают данные: только с повторным вводом токена
    const list = (body as { ops?: unknown })?.ops
    if (Array.isArray(list) && list.some(o => o?.type === 'reset' || o?.type === 'import')) this.confirm.require(req)
    return this.progress.apply(body)
  }
}
