import { Module } from '@nestjs/common'
import { WordsExportController } from './wordsexport.controller.js'
import { WordsExportService } from './wordsexport.service.js'

@Module({ controllers: [WordsExportController], providers: [WordsExportService] })
export class WordsExportModule {}
