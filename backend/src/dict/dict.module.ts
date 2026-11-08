import { Module } from '@nestjs/common'
import { DictController } from './dict.controller.js'
import { DictService } from './dict.service.js'

@Module({ controllers: [DictController], providers: [DictService], exports: [DictService] })
export class DictModule {}
