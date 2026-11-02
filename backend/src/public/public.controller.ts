import { Body, Controller, Get, Post, Put, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { createReadStream } from 'node:fs'
import { memoryStorage } from 'multer'
import { Owner, Public } from '../auth/auth'
import { MAX_OG } from '../config'
import { PublicService } from './public.service'

/** /api/public: визитка. Чтение открыто всем (но только пока владелец включил), настройки только владельцу. */
@Controller('public')
export class PublicController {
  constructor(private readonly pub: PublicService) {}

  /** Кэш ставится только на успешный ответ: «закрыто» (404) нельзя кэшировать, иначе после включения визитки её минуту не видно. */
  @Public()
  @Get('me')
  me(@Res({ passthrough: true }) res: Response) {
    const card = this.pub.publicCard()
    res.setHeader('Cache-Control', 'public, max-age=60')
    return card
  }

  @Public()
  @Get('og.png')
  og(@Res({ passthrough: true }) res: Response) {
    const file = this.pub.publicOg()
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(createReadStream(file), { type: 'image/png' })
  }

  @Public()
  @Get('cover')
  cover(@Res({ passthrough: true }) res: Response) {
    const f = this.pub.publicCover()
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Owner()
  @Get('settings')
  settings() {
    return this.pub.settings()
  }

  @Owner()
  @Put('settings')
  save(@Body() body: { enabled?: unknown; cover?: unknown; card?: unknown }) {
    return this.pub.save(body)
  }

  @Owner()
  @Post('og')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_OG, files: 1, fields: 0, parts: 2 } }))
  saveOg(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.pub.saveOg(file)
  }
}
