import { Body, Controller, Get, Put } from '@nestjs/common'
import { CurrentWho, Who } from '../auth/auth'
import { NotesService } from './notes.service'

/** GET и PUT /api/notes. Гость заметок не видит и не сохраняет: ему пустой ответ, его запись игнорируется. */
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

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
}
