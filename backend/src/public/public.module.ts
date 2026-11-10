import { Module } from '@nestjs/common'
import { PublicController } from './public.controller.js'
import { PublicService } from './public.service.js'
import { StudyController } from './study.controller.js'

@Module({ controllers: [PublicController, StudyController], providers: [PublicService] })
export class PublicModule {}
