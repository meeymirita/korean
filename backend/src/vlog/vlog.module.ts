import { Module } from '@nestjs/common'
import { VlogController } from './vlog.controller.js'
import { VlogService } from './vlog.service.js'

@Module({ controllers: [VlogController], providers: [VlogService] })
export class VlogModule {}
