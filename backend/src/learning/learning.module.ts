import { Module } from '@nestjs/common'
import { ProgressModule } from '../progress/progress.module.js'
import { LearningController } from './learning.controller.js'
import { LearningService } from './learning.service.js'

@Module({ imports: [ProgressModule], controllers: [LearningController], providers: [LearningService] })
export class LearningModule {}
