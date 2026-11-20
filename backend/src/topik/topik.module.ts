import { Module } from '@nestjs/common'
import { TopikController } from './topik.controller.js'
import { TopikService } from './topik.service.js'

@Module({ controllers: [TopikController], providers: [TopikService] })
export class TopikModule {}
