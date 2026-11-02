import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from './auth/auth'
import { Db } from './db/db.service'

/** Проверка для scripts/deploy.sh: сервер жив и база читается. Наружу только ok, без подробностей. */
@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  health(@Res({ passthrough: true }) res: Response) {
    try {
      this.db.sql.prepare('SELECT 1').get()
      return { ok: true }
    } catch (e) {
      console.error('health: база не отвечает:', (e as Error).message)
      res.status(503)
      return { ok: false }
    }
  }
}
