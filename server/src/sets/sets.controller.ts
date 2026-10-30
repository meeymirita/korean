import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { SetsService } from './sets.service'

/** /api/sets: сохранённые наборы «Сегодня», только для владельца. */
@Owner()
@Controller('sets')
export class SetsController {
  constructor(private readonly sets: SetsService) {}

  @Get()
  list() {
    return this.sets.list()
  }

  @Post()
  create(@Body() body: { day?: unknown; right?: unknown; total?: unknown; data?: unknown }) {
    return this.sets.create(body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sets.remove(id)
  }
}
