import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from './auth/auth.js'
import { Db } from './db/db.service.js'

/** Проверка для scripts/deploy.sh: сервер жив и база читается. Наружу только ok, без подробностей. */
@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await (await this.db.orm()).$queryRawUnsafe('SELECT 1')
      return { ok: true }
    } catch (e) {
      console.error('health: база не отвечает:', (e as Error).message)
      res.status(503)
      return { ok: false }
    }
  }
}
