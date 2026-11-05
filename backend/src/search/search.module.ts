import { Module } from '@nestjs/common'
import { SearchController } from './search.controller.js'
import { SearchClient } from './search.client.js'
import { DbModule } from '../db/db.module.js'
import { Db } from '../db/db.service.js'

@Module({
  imports: [DbModule],
  controllers: [SearchController],
  providers: [{ provide: SearchClient, useFactory: (db: Db) => new SearchClient(db), inject: [Db] }],
  exports: [SearchClient],
})
export class SearchModule {}
