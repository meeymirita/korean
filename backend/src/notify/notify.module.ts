import { Global, Module } from '@nestjs/common'
import { NotifyController } from './notify.controller.js'
import { NotifyService } from './notify.service.js'
import { StudyWeeklyService } from '../study/study-weekly.service.js'

@Global()
@Module({ controllers: [NotifyController], providers: [NotifyService, StudyWeeklyService], exports: [NotifyService] })
export class NotifyModule {}
