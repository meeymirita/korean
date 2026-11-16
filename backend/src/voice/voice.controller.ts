import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { VoiceService } from './voice.service.js'

/** /api/voice: голосовой собеседник (OpenAI Realtime), только владелец. Звук идёт из браузера прямо в OpenAI; здесь временный ключ, лимит минут и расшифровки. */
@Owner()
@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Настроен ли ключ, лимит и остаток минут за сегодня. Сам ключ не отдаётся. */
  @Get()
  status() {
    return this.voice.status()
  }

  @Get('sessions')
  list() {
    return this.voice.list()
  }

  /** Начать разговор: временный ключ и номер разговора. */
  @Post('sessions')
  @HttpCode(200)
  start(@Body() body: Record<string, unknown>) {
    return this.voice.start(body)
  }

  @Get('sessions/:id')
  get(@Param('id') id: string) {
    return this.voice.get(id)
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  message(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.voice.addMessage(id, body)
  }

  @Post('sessions/:id/end')
  @HttpCode(200)
  end(@Param('id') id: string) {
    return this.voice.end(id)
  }

  @Delete('sessions/:id')
  remove(@Param('id') id: string) {
    return this.voice.remove(id)
  }
}
