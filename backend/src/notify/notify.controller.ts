import { Body, Controller, Get, Header, HttpCode, NotFoundException, Post, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { Request } from 'express'
import { Owner } from '../auth/auth.js'
import { ConfirmService } from '../auth/confirm.service.js'
import { TG_TOPICS, type TgTopic } from '../mail/templates.js'
import { NotifyService } from './notify.service.js'

/** /api/notify: темы Telegram-группы и пробная отправка в тему (только владельцу). */
@Owner()
@Controller('notify')
export class NotifyController {
  constructor(
    private readonly notify: NotifyService,
    private readonly confirm: ConfirmService,
  ) {}

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

  /** Очистка темы (topic: id темы) или всей группы (topic: 'all'). Опасное действие: только с повторным вводом токена (403 без него). */
  @Post('clear')
  @HttpCode(200)
  async clear(@Req() req: Request, @Body() body: { topic?: unknown }) {
    await this.confirm.require(req)
    const topic = body?.topic
    if (topic !== 'all' && (typeof topic !== 'string' || !(TG_TOPICS as readonly string[]).includes(topic))) return { ok: false, message: 'неизвестная тема', removed: 0 }
    try {
      const removed = topic === 'all' ? await this.notify.clearAll() : await this.notify.clearTopic(topic as TgTopic)
      return { ok: true, message: '', removed }
    } catch (e) {
      return { ok: false, message: (e as Error).message.slice(0, 160), removed: 0 }
    }
  }

  /** Редактор сообщения General: текст (свой или по умолчанию), есть ли баннер, отправлено ли. */
  @Get('guide')
  guideState() {
    return this.notify.guideState()
  }

  /** Текущий баннер сообщения для предпросмотра. */
  @Get('guide/banner')
  @Header('Cache-Control', 'no-store')
  async guideBanner() {
    const b = await this.notify.guideBanner()
    if (!b) throw new NotFoundException()
    return new StreamableFile(b.buffer, { type: b.mime })
  }

  /** Сохранить и отправить сообщение в General (текст, необязательный новый баннер; mode=new отправляет заново). Всегда 200: результат в { ok, message }. */
  @Post('guide')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('banner', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4, parts: 6 } }))
  async guide(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: { text?: unknown; mode?: unknown }) {
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return { ok: false, message: 'баннер: нужен JPG, PNG или WebP' }
    try {
      const r = await this.notify.publishGuide({
        text: typeof body?.text === 'string' ? body.text : '',
        file: file && { buffer: file.buffer, mimetype: file.mimetype },
        forceNew: body?.mode === 'new',
      })
      return { ok: true, message: r.pinned ? '' : 'отправлено, но не закреплено: дайте боту право «Закрепление сообщений»', edited: r.edited }
    } catch (e) {
      return { ok: false, message: (e as Error).message.slice(0, 200) }
    }
  }
}
