import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { TG_TOPICS, type TgTopic } from '../mail/templates.js'
import { NotifyService } from './notify.service.js'

/** /api/notify: темы Telegram-группы и пробная отправка в тему (только владельцу). */
@Owner()
@Controller('notify')
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Get('topics')
  topics() {
    return this.notify.topics()
  }

  /** Свой текст в выбранную тему. Всегда 200: результат в { ok, message }. */
  @Post('topic')
  @HttpCode(200)
  async topic(@Body() body: { topic?: unknown; text?: unknown }) {
    const topic = body?.topic
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (typeof topic !== 'string' || !(TG_TOPICS as readonly string[]).includes(topic)) return { ok: false, message: 'неизвестная тема' }
    if (!text) return { ok: false, message: 'введите текст' }
    if (text.length > 900) return { ok: false, message: 'текст длиннее 900 знаков' }
    try {
      await this.notify.sendToTopic(topic as TgTopic, text)
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: (e as Error).message.slice(0, 160) }
    }
  }

  /** Настоящее сообщение темы с выдуманными данными. Всегда 200: результат в { ok, message }. */
  @Post('sample')
  @HttpCode(200)
  async sample(@Body() body: { topic?: unknown }) {
    const topic = body?.topic
    if (typeof topic !== 'string' || !(TG_TOPICS as readonly string[]).includes(topic)) return { ok: false, message: 'неизвестная тема' }
    try {
      await this.notify.sendSample(topic as TgTopic)
      return { ok: true, message: '' }
    } catch (e) {
      return { ok: false, message: (e as Error).message.slice(0, 160) }
    }
  }
}
