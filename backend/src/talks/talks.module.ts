import { Module } from '@nestjs/common'
import { TalksController } from './talks.controller.js'
import { TalksService } from './talks.service.js'

@Module({ controllers: [TalksController], providers: [TalksService] })
export class TalksModule {}
