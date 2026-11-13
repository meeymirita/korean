import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import type { Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import { memoryStorage } from 'multer'
import { Owner } from '../auth/auth.js'
import { ConfirmService } from '../auth/confirm.service.js'
import { MAX_IMAGE } from '../config.js'
import { ImagesService } from './images.service.js'

/** /api/images: картинки только для владельца. Файлы отдаются по токену (сайт запрашивает их с заголовком и показывает через blob). */
@Owner()
@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService, private readonly confirm: ConfirmService) {}

  @Get()
  /** ?kind=gallery (по умолчанию) | note | cover */
  list(@Query('kind') kind?: string) {
    return this.images.list(kind)
  }

  /** Загрузка: multipart/form-data, поле file (до 50 МБ) и необязательные поля caption, description и kind (gallery / note / cover). */
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1, fields: 5, fieldSize: 4096, parts: 7, headerPairs: 30 } }))
  add(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: { caption?: unknown; description?: unknown; kind?: unknown; tags?: unknown }) {
    return this.images.add(file, body?.caption, body?.description, body?.kind, body?.tags)
  }

  /** Корзина «Картинок» (30 дней). */
  @Get('trash')
  trash() {
    return this.images.trash()
  }

  @Get(':id/file')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(@Param('id') id: string) {
    const f = await this.images.open(id, 'file')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Get(':id/thumb')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  async thumb(@Param('id') id: string) {
    const f = await this.images.open(id, 'thumb')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { caption?: unknown; description?: unknown; tags?: unknown }) {
    return this.images.update(id, body)
  }

  /** Картинка «Картинок» уходит в корзину (файлы остаются); вложение заметки и обложка стираются сразу. */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.images.remove(id)
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string) {
    return this.images.restore(id)
  }

  /** Удалить из корзины насовсем (стираются файлы и копия на Диске): только с повторным токеном (X-Confirm-Token). */
  @Delete(':id/permanent')
  async purge(@Req() req: Request, @Param('id') id: string) {
    await this.confirm.require(req)
    return this.images.purge(id)
  }
}
