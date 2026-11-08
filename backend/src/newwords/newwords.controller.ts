import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { InboxRead, Owner } from '../auth/auth.js'
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

  @Post()
  add(@Body() body: unknown) {
    return this.words.add(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.words.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.words.remove(id)
  }
}
