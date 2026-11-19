import { Controller, Get, Query } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { TalksService } from './talks.service.js'

/** /api/talks: общая история чатов и голосовых разговоров с поиском по тексту (`?q=`), только владелец. */
@Owner()
@Controller('talks')
export class TalksController {
  constructor(private readonly talks: TalksService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.talks.list(q)
  }
}
