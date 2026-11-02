import { Body, Controller, Delete, Get, Header, Param, Patch, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import { memoryStorage } from 'multer'
import { Owner } from '../auth/auth'
import { MAX_DOC } from '../config'
import { PlansService } from './plans.service'

/** /api/plans: записи календаря с файлами, только для владельца. Файлы сайт запрашивает с токеном и открывает через blob. */
@Owner()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list()
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.plans.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.plans.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plans.remove(id)
  }

  /** Загрузка файла к записи: multipart/form-data, поле file (PDF, Word или картинка, до 25 МБ). */
  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_DOC, files: 1, fields: 2, fieldSize: 1024, parts: 4, headerPairs: 30 } }))
  addFile(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.plans.addFile(id, file)
  }

  @Get('files/:fid/file')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  file(@Param('fid') fid: string) {
    const f = this.plans.open(fid, 'file')
    return new StreamableFile(createReadStream(f.path), { type: f.mime, disposition: `${f.image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}` })
  }

  @Get('files/:fid/thumb')
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  thumb(@Param('fid') fid: string) {
    const f = this.plans.open(fid, 'thumb')
    return new StreamableFile(createReadStream(f.path), { type: f.mime })
  }

  @Delete('files/:fid')
  removeFile(@Param('fid') fid: string) {
    return this.plans.removeFile(fid)
  }
}
