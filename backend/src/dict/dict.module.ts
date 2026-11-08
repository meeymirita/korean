import { Module } from '@nestjs/common'
import { DictController } from './dict.controller.js'
import { DictVisits } from './dict.visits.service.js'
import { DictService } from './dict.service.js'

@Module({ controllers: [DictController], providers: [DictService, DictVisits], exports: [DictService] })
export class DictModule {}
