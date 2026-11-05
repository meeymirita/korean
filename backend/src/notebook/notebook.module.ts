import { Module } from '@nestjs/common'
import { NotebookController } from './notebook.controller.js'
import { NotebookService } from './notebook.service.js'

@Module({ controllers: [NotebookController], providers: [NotebookService] })
export class NotebookModule {}
