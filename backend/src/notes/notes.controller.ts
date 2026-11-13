import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import type { Request } from 'express'
import { CurrentWho, Owner, Who } from '../auth/auth.js'
import { ConfirmService } from '../auth/confirm.service.js'
import { NotesService } from './notes.service.js'

/** GET и PUT /api/notes. Гость заметок не видит и не сохраняет: ему пустой ответ, его запись игнорируется. */
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService, private readonly confirm: ConfirmService) {}

  @Get()
  read(@CurrentWho() who: Who) {
    return who.role === 'guest' ? {} : this.notes.read()
  }

  @Put()
  write(@CurrentWho() who: Who, @Body() body: unknown) {
    if (who.role === 'guest') {
      this.notes.validate(body) // формат проверяем так же, но не сохраняем
      return { ok: true, guest: true }
    }
    return this.notes.replace(body)
  }

  /** Корзина (30 дней): только владелец. Убранные из списка заметки попадают сюда при PUT. */
  @Owner()
  @Get('trash')
  trash() {
    return this.notes.trash()
  }

  @Owner()
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string) {
    return this.notes.restore(id)
  }

  /** Удалить из корзины насовсем: только с повторным токеном (X-Confirm-Token). */
  @Owner()
  @Delete(':id')
  async purge(@Req() req: Request, @Param('id') id: string) {
    await this.confirm.require(req)
    return this.notes.purge(id)
  }
}
