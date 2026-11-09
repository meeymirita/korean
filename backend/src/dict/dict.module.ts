import { Module } from '@nestjs/common'
import { DictController } from './dict.controller.js'
import { DictVisits } from './dict.visits.service.js'
import { DictService } from './dict.service.js'
import { DictVisitsWeekly } from './dict-visits-weekly.service.js'

@Module({ controllers: [DictController], providers: [DictService, DictVisits, DictVisitsWeekly], exports: [DictService] })
export class DictModule {}
