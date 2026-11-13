import { Module } from '@nestjs/common'
import { ImagesModule } from '../images/images.module.js'
import { NotesModule } from '../notes/notes.module.js'
import { TrashService } from './trash.service.js'

@Module({ imports: [NotesModule, ImagesModule], providers: [TrashService] })
export class TrashModule {}
