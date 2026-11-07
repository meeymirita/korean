import { Global, Module } from '@nestjs/common'
import { NotifyController } from './notify.controller.js'
import { NotifyService } from './notify.service.js'

@Global()
@Module({ controllers: [NotifyController], providers: [NotifyService], exports: [NotifyService] })
export class NotifyModule {}
