import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'
import { InboxRead, InboxWrite, Owner } from '../auth/auth.js'
import { NewWordsService } from './newwords.service.js'

/** /api/new-words: только владелец (гостю 403, ничего не сохраняется). */
@Controller('new-words')
@Owner()
export class NewWordsController {
  constructor(private readonly words: NewWordsService) {}

  @Get()
  @InboxRead()
  list() {
    return this.words.list()
  }

  /** Временный токен (10 минут): владелец отдаёт его Claude. Тело `{ "write": true }` добавляет право записи во входящие. Создать и отозвать может только владелец. */
  @Post('token')
  @HttpCode(200)
  createToken(@Body() body: { write?: unknown } | undefined) {
    return this.words.createToken(body?.write === true)
  }

  @Delete('token')
  revokeToken() {
    return this.words.revokeToken()
  }

  @Post()
  @InboxWrite()
  add(@Body() body: unknown) {
    return this.words.add(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.words.update(id, body)
  }

  @Patch(':id')
  status(@Param('id') id: string, @Body() body: unknown) {
    return this.words.setStatus(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.words.remove(id)
  }
}
