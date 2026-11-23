import { Module } from '@nestjs/common'
import { ManhwaController } from './manhwa.controller.js'

@Module({ controllers: [ManhwaController] })
export class ManhwaModule {}
