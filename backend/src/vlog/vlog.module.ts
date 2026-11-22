import { Module } from '@nestjs/common'
import { VlogController, VlogTestsController } from './vlog.controller.js'
import { VlogService } from './vlog.service.js'

@Module({ controllers: [VlogController, VlogTestsController], providers: [VlogService] })
export class VlogModule {}
