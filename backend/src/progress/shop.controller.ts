import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { ShopService } from './shop.service.js'

/** Магазин Юны: только владельцу. */
@Controller('shop')
@Owner()
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get()
  state(@Query('day') day?: string) {
    return this.shop.state(day)
  }

  @Get('log')
  log(@Query('kind') kind?: string, @Query('limit') limit?: string) {
    return this.shop.log(kind, Number(limit))
  }

  @Post('buy')
  @HttpCode(200)
  buy(@Body() body: unknown) {
    return this.shop.buy(body)
  }

  @Post('claim')
  @HttpCode(200)
  claim(@Body() body: unknown) {
    return this.shop.claim(body)
  }

  @Post('use')
  @HttpCode(200)
  use(@Body() body: unknown) {
    return this.shop.use(body)
  }
}
