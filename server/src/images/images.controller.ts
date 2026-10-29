import { Body, Controller, Delete, Get, Header, Param, Patch, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
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
  list() {
    return this.images.list()
  }

  /** Загрузка: multipart/form-data, поле file (до 50 МБ) и необязательное поле caption. */
  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE, files: 1 } }))
  add(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: { caption?: unknown }) {
    return this.images.add(file, body?.caption)
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
  caption(@Param('id') id: string, @Body() body: { caption?: unknown }) {
    return this.images.caption(id, body?.caption)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.images.remove(id)
  }
}
