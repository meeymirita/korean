import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { LessonService } from './lesson.service.js'

/** /api/lesson: настройки письма-напоминания о созвоне с учителем (только владельцу). */
@Owner()
@Controller('lesson')
export class LessonController {
  constructor(private readonly lesson: LessonService) {}

  @Get()
  get() {
    return this.lesson.status()
  }

  @Put()
  set(@Body() body: { enabled?: unknown; weekday?: unknown; time?: unknown }) {
    return this.lesson.set(body ?? {})
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.lesson.test()
  }
}
