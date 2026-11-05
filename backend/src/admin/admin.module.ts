import { Module } from '@nestjs/common'
import { BackupArchiveService } from './backup-archive.service.js'
import { BackupStatusController } from './backup-status.controller.js'
import { OpsReportService } from './ops-report.service.js'
import { OpsController } from './ops.controller.js'
import { OpsService } from './ops.service.js'

@Module({ controllers: [BackupStatusController, OpsController], providers: [BackupArchiveService, OpsService, OpsReportService] })
export class AdminModule {}
