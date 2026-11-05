import { Module } from '@nestjs/common'
import { SetsController } from './sets.controller.js'
import { SetsService } from './sets.service.js'

@Module({ controllers: [SetsController], providers: [SetsService] })
export class SetsModule {}
