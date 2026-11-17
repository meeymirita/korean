import { Controller, Get } from '@nestjs/common'
import { InboxRead, Owner } from '../auth/auth.js'
import { LearningService } from './learning.service.js'

/** /api/learning: краткая сводка об обучении. Читает владелец или его временный токен для Claude (любой: чтение или запись). */
@Controller('learning')
@Owner()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get()
  @InboxRead()
  summary() {
    return this.learning.summary()
  }
}
