import { Body, Controller, Delete, Get, Header, Param, Post, Put, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import { memoryStorage } from 'multer'
import { Owner, Public } from '../auth/auth'
import { MAX_SITE_IMAGE } from '../config'
import { SiteImgService } from './siteimg.service'

/** /api/site-images: подмена картинок сайта. Читать может любой посетитель, менять только владелец. */
@Controller('site-images')
export class SiteImgController {
  constructor(private readonly svc: SiteImgService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-cache')
  list() {
    return this.svc.list()
  }

  @Public()
  @Get('file/:key')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  file(@Param('key') key: string) {
    const f = this.svc.open(key)
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Owner()
  @Post(':key/file')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_SITE_IMAGE, files: 1, fields: 0, parts: 2 } }))
  upload(@Param('key') key: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.svc.setFile(key, file)
  }

  @Owner()
  @Put(':key')
  set(@Param('key') key: string, @Body() body: { url?: unknown; x?: unknown; y?: unknown; zoom?: unknown }) {
    return this.svc.set(key, body)
  }

  @Owner()
  @Delete(':key')
  remove(@Param('key') key: string) {
    return this.svc.remove(key)
  }
}
