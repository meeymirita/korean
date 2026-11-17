import { Module } from '@nestjs/common'
import { NewWordsModule } from '../newwords/newwords.module.js'
import { MaterialsController } from './materials.controller.js'
import { MaterialsService } from './materials.service.js'

@Module({ imports: [NewWordsModule], controllers: [MaterialsController], providers: [MaterialsService] })
export class MaterialsModule {}
