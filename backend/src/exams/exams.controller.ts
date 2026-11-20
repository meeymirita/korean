import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { ExamsService } from './exams.service.js'

/** /api/exams: итоговая оценка по правилам, только для владельца. */
@Owner()
@Controller('exams')
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list() {
    return this.exams.list()
  }

  /** Черновик экзамена: задания и сохранённые части (продолжить с другого устройства). */
  @Get('draft')
  draft() {
    return this.exams.draft()
  }

  @Put('draft')
  saveDraft(@Body() body: unknown) {
    return this.exams.saveDraft(body)
  }

  @Delete('draft')
  dropDraft() {
    return this.exams.dropDraft()
  }

  /** Блиц дня: дни и итоги (серия дней подряд) и слабые правила. */
  @Get('blitz')
  blitz() {
    return this.exams.blitz()
  }

  @Post('blitz')
  saveBlitz(@Body() body: { day?: unknown; right?: unknown; total?: unknown; rules?: unknown }) {
    return this.exams.saveBlitz(body ?? {})
  }

  /** Один раз перенести данные блица из браузера (принимается, только пока на сервере пусто). */
  @Put('blitz')
  importBlitz(@Body() body: unknown) {
    return this.exams.importBlitz(body)
  }

  /** Экзамены единиц книги: лучший и последний результат по каждой. */
  @Get('units')
  units() {
    return this.exams.units().then(units => ({ units }))
  }

  @Post('units')
  saveUnit(@Body() body: { unit?: unknown; right?: unknown; total?: unknown }) {
    return this.exams.saveUnit(body ?? {})
  }

  /** Разбор последних попыток по правилу: где были ошибки. */
  @Get(':id/log')
  log(@Param('id') id: string) {
    return this.exams.log(id)
  }

  @Post()
  submit(@Body() body: { id?: unknown; title?: unknown; right?: unknown; total?: unknown; mistakes?: unknown; rules?: unknown }) {
    return this.exams.submit(body)
  }
}
