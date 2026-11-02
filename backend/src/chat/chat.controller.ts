import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { ChatService } from './chat.service'

/** /api/chat: помощник по корейскому (OpenRouter), только для владельца. */
@Owner()
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Настроен ли ключ и сколько вопросов в сутки. Сам ключ не отдаётся. */
  @Get()
  status() {
    return this.chat.status()
  }

  @Post()
  @HttpCode(200)
  ask(@Body() body: Record<string, unknown>) {
    return this.chat.ask(body)
  }
}
