import { Module } from '@nestjs/common'
import { VideoController } from './video.controller.js'

@Module({ controllers: [VideoController] })
export class VideoModule {}
