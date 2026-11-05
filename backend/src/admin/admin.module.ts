import { Module } from '@nestjs/common'
import { BackupArchiveService } from './backup-archive.service.js'
import { BackupStatusController } from './backup-status.controller.js'
import { DbViewerController } from './db-viewer.controller.js'
import { DbViewerService } from './db-viewer.service.js'
import { LogsController } from '../logs/logs.controller.js'
import { LogsService } from '../logs/logs.service.js'
import { OpsController } from './ops.controller.js'
import { OpsService } from './ops.service.js'

@Module({ controllers: [DbViewerController, LogsController, BackupStatusController, OpsController], providers: [DbViewerService, LogsService, BackupArchiveService, OpsService] })
export class AdminModule {}
