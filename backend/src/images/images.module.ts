import { Module } from '@nestjs/common'
import { ImagesController } from './images.controller.js'
import { ImagesService } from './images.service.js'
import { SearchModule } from '../search/search.module.js'

@Module({ imports: [SearchModule], controllers: [ImagesController], providers: [ImagesService] })
export class ImagesModule {}
