import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Owner } from '../auth/auth.js'
import { ConfirmService } from '../auth/confirm.service.js'
import { GuestsService } from './guests.service.js'

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
  async create(@Req() req: Request, @Body() body: { hours?: unknown; label?: unknown }) {
    await this.confirm.require(req) // гостевой токен даёт доступ ко всему: создаётся только с повторным вводом токена владельца
    return this.guests.create(body?.hours, body?.label)
  }

  @Delete(':id')
  async revoke(@Param('id') id: string) {
    await this.guests.revoke(id)
    return { ok: true }
  }
}
