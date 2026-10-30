import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { ReminderService } from './reminder.service'

/** /api/reminder: настройки письма-напоминания (только владельцу). */
@Owner()
@Controller('reminder')
export class ReminderController {
  constructor(private readonly reminder: ReminderService) {}

  @Get()
  get() {
    return this.reminder.status()
  }

  @Put()
  set(@Body() body: { enabled?: unknown; time?: unknown }) {
    return this.reminder.set(body ?? {})
  }

  @Post('test')
  @HttpCode(200)
  test() {
    return this.reminder.test()
  }
}
