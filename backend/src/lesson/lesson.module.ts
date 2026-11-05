import { Module } from '@nestjs/common'
import { LessonController } from './lesson.controller.js'
import { LessonService } from './lesson.service.js'

@Module({ controllers: [LessonController], providers: [LessonService] })
export class LessonModule {}
