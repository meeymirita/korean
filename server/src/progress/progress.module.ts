import { Module } from '@nestjs/common'
import { ProgressController } from './progress.controller'
import { ProgressService } from './progress.service'
import { ShopController } from './shop.controller'
import { ShopService } from './shop.service'

@Module({ controllers: [ProgressController, ShopController], providers: [ProgressService, ShopService] })
export class ProgressModule {}
