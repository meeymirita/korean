import { Global, Module } from '@nestjs/common'
import { BackupService } from './backup.service.js'
import { Db } from './db.service.js'

@Global()
@Module({ providers: [Db, BackupService], exports: [Db] })
export class DbModule {}
