import { Module } from '@nestjs/common'
import { PicController } from './pic.controller.js'

@Module({ controllers: [PicController] })
export class PicModule {}
