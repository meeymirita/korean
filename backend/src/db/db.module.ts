import { Global, Module } from '@nestjs/common'
import { BackupService } from './backup.service'
import { Db } from './db.service'

@Global()
@Module({ providers: [Db, BackupService], exports: [Db] })
export class DbModule {}
