import { Module } from '@nestjs/common'
import { NewWordsController } from './newwords.controller.js'
import { NewWordsService } from './newwords.service.js'

@Module({ controllers: [NewWordsController], providers: [NewWordsService] })
export class NewWordsModule {}
