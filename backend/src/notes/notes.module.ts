import { Module } from '@nestjs/common'
import { NotesController } from './notes.controller.js'
import { NotesService } from './notes.service.js'
import { SearchModule } from '../search/search.module.js'

@Module({ imports: [SearchModule], controllers: [NotesController], providers: [NotesService] })
export class NotesModule {}
