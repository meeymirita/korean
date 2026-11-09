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
