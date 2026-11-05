import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { CurrentWho, Owner, Who } from '../auth/auth.js'
import { ConfirmService } from '../auth/confirm.service.js'
import { ProgressService } from './progress.service.js'

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

  /** GET /api/report?days=30: отчёт по режимам (0 или пусто — за всё время). Только владельцу. */
  @Get('report')
  @Owner()
  report(@Query('days') days?: string) {
    return this.progress.report(Number(days) > 0 ? Math.min(Number(days), 3650) : 0)
  }

  /** GET /api/report/clock?days=90: ответы по часу дня (0–23) за период — когда больше ошибок. Только владельцу. */
  @Get('report/clock')
  @Owner()
  clock(@Query('days') days?: string) {
    return this.progress.clock(Number(days) > 0 ? Math.min(Number(days), 365) : 90)
  }

  /** GET /api/report/weeks: «эта неделя vs прошлая» — ответы и время последних 7 дней против предыдущих. Только владельцу. */
  @Get('report/weeks')
  @Owner()
  weeks() {
    return this.progress.weekCompare()
  }

  /** GET /api/report/series?source=game&mode=build&days=30: ответы по дням для графика; mode не задан — весь раздел, mode=- — ответы без режима. */
  @Get('report/series')
  @Owner()
  series(@Query('source') source?: string, @Query('mode') mode?: string, @Query('days') days?: string) {
    return this.progress.series(String(source ?? ''), mode === undefined ? undefined : mode === '-' ? '' : mode, Number(days) > 0 ? Math.min(Number(days), 365) : 0)
  }

  /** GET /api/report/answers?source=game&mode=type&days=30&only=bad|ok: сами ответы (новые сверху, не больше 300) для окна графика.
   * Без `source` — по всем разделам сразу (общий «Дневник ошибок»). */
  @Get('report/answers')
  @Owner()
  answers(@Query('source') source?: string, @Query('mode') mode?: string, @Query('days') days?: string, @Query('only') only?: string) {
    return this.progress.answersOf(String(source ?? ''), mode === undefined ? undefined : mode === '-' ? '' : mode, Number(days) > 0 ? Math.min(Number(days), 3650) : 0, only === 'bad' || only === 'ok' ? only : undefined)
  }

  /** POST /api/ops: пачка действий { ops: [{ type: 'answer' | 'reset' | 'profile' | 'settings' | 'import', … }] }. */
  @Post('ops')
  @HttpCode(200)
  async ops(@CurrentWho() who: Who, @Req() req: Request, @Body() body: unknown) {
    if (who.role === 'guest') return { ok: true, guest: true }
    // сброс прогресса и загрузка копии стирают данные: только с повторным вводом токена
    const list = (body as { ops?: unknown })?.ops
    if (Array.isArray(list) && list.some(o => o?.type === 'reset' || o?.type === 'import')) await this.confirm.require(req)
    return this.progress.apply(body)
  }
}
