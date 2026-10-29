import { Controller, Get, Param, Query } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { DbViewerService } from './db-viewer.service'

/** /api/db: просмотр базы только для владельца (вкладка «База» в кабинете). Менять данные здесь нельзя. */
@Owner()
@Controller('db')
export class DbViewerController {
  constructor(private readonly viewer: DbViewerService) {}

  @Get('tables')
  tables() {
    return this.viewer.tables()
  }

  @Get('tables/:name')
  rows(@Param('name') name: string, @Query('limit') limit?: string, @Query('offset') offset?: string, @Query('q') q?: string) {
    return this.viewer.rows(name, limit, offset, q)
  }
}
