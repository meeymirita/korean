import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Owner } from '../auth/auth'
import { ConfirmService } from '../auth/confirm.service'
import { GuestsService } from './guests.service'

/** /api/guests: только для владельца. */
@Owner()
@Controller('guests')
export class GuestsController {
  constructor(
    private readonly guests: GuestsService,
    private readonly confirm: ConfirmService,
  ) {}

  @Get()
  list() {
    return this.guests.list()
  }

  @Post()
  create(@Req() req: Request, @Body() body: { hours?: unknown; label?: unknown }) {
    this.confirm.require(req) // гостевой токен даёт доступ ко всему: создаётся только с повторным вводом токена владельца
    return this.guests.create(body?.hours, body?.label)
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    this.guests.revoke(id)
    return { ok: true }
  }
}
