import { Module } from '@nestjs/common'
import { BackupArchiveService } from './backup-archive.service'
import { BackupStatusController } from './backup-status.controller'
import { DbViewerController } from './db-viewer.controller'
import { DbViewerService } from './db-viewer.service'
import { LogsController } from '../logs/logs.controller'
import { LogsService } from '../logs/logs.service'

@Module({ controllers: [DbViewerController, LogsController, BackupStatusController], providers: [DbViewerService, LogsService, BackupArchiveService] })
export class AdminModule {}
