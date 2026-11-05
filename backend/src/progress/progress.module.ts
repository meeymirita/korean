import { Module } from '@nestjs/common'
import { ProgressController } from './progress.controller.js'
import { ProgressService } from './progress.service.js'
import { ShopController } from './shop.controller.js'
import { ShopService } from './shop.service.js'

@Module({ controllers: [ProgressController, ShopController], providers: [ProgressService, ShopService] })
export class ProgressModule {}
