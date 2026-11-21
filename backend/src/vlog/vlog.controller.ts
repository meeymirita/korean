import { Body, Controller, Get, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { VlogService } from './vlog.service.js'

/** /api/vlog-watched: какие влоги владелец отметил просмотренными (`{ watched: [номера видео] }`, только владельцу). */
@Owner()
@Controller('vlog-watched')
export class VlogController {
  constructor(private readonly vlog: VlogService) {}

  @Get()
  get() {
    return this.vlog.get()
  }

  @Put()
  set(@Body() body: unknown) {
    return this.vlog.set(body)
  }
}
