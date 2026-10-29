import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { GuestsService } from './guests.service'

/** /api/guests: только для владельца. */
@Owner()
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  list() {
    return this.guests.list()
  }

  @Post()
  create(@Body() body: { hours?: unknown; label?: unknown }) {
    return this.guests.create(body?.hours, body?.label)
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    this.guests.revoke(id)
    return { ok: true }
  }
}
