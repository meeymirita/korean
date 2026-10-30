import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import { memoryStorage } from 'multer'
import { Owner } from '../auth/auth'
import { MAX_IMAGE } from '../config'
import { ImagesService } from './images.service'

/** /api/images: картинки только для владельца. Файлы отдаются по токену (сайт запрашивает их с заголовком и показывает через blob). */
@Owner()
@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

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

  @Get(':id/file')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  file(@Param('id') id: string) {
    const f = this.images.open(id, 'file')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Get(':id/thumb')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  thumb(@Param('id') id: string) {
    const f = this.images.open(id, 'thumb')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { caption?: unknown; description?: unknown; tags?: unknown }) {
    return this.images.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.images.remove(id)
  }
}
