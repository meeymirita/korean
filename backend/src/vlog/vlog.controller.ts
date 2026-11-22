import { Body, Controller, Get, Post, Put } from '@nestjs/common'
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

/** /api/vlog-tests: попытки теста по влогам (`GET` список, `POST` новая попытка), только владельцу. */
@Owner()
@Controller('vlog-tests')
export class VlogTestsController {
  constructor(private readonly vlog: VlogService) {}

  @Get()
  list() {
    return this.vlog.tests()
  }

  @Post()
  add(@Body() body: unknown) {
    return this.vlog.addTest(body)
  }
}
