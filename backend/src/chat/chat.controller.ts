import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { ChatService } from './chat.service.js'

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

  /** Сохранённые чаты (новые сверху), один чат с сообщениями и удаление чата. */
  @Get('conversations')
  list() {
    return this.chat.list()
  }

  @Get('conversations/:id')
  get(@Param('id') id: string) {
    return this.chat.get(id)
  }

  @Delete('conversations/:id')
  remove(@Param('id') id: string) {
    return this.chat.remove(id)
  }

  /** Вопрос помощнику. conv: 'new' завести чат, номер чата дописать в него, без поля ничего не сохранять. */
  @Post()
  @HttpCode(200)
  ask(@Body() body: Record<string, unknown>) {
    return this.chat.ask(body)
  }
}
