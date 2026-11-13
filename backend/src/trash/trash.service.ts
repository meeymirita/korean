/** Раз в сутки окончательно стирает из корзины заметки и картинки, пролежавшие там больше 30 дней. */
import { Injectable, OnModuleInit } from '@nestjs/common'
import { BackgroundJobs } from '../jobs/background-jobs.service.js'
import { ImagesService } from '../images/images.service.js'
import { NotesService } from '../notes/notes.service.js'
import { trashCutoff } from './trash.js'

@Injectable()
export class TrashService implements OnModuleInit {
  constructor(
    private readonly notes: NotesService,
    private readonly images: ImagesService,
    private readonly jobs: BackgroundJobs,
  ) {}

  onModuleInit() {
    this.jobs.register('trash.purge', () => this.purgeExpired())
  }

  /** Повторный запуск безопасен: второй раз просроченного уже нет. */
  async purgeExpired(now = Date.now()) {
    const cutoff = trashCutoff(now)
    const notes = await this.notes.purgeOlderThan(cutoff)
    const images = await this.images.purgeOlderThan(cutoff)
    return { notes, images }
  }
}
