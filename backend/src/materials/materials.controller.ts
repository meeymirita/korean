import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { InboxRead, InboxWrite, Owner, Public } from '../auth/auth.js'
import { MATERIALS_FORMAT } from './materials.schema.js'
import { MaterialsService } from './materials.service.js'

/** /api/materials: пачки материалов из тетрадей и заданий. Читать и добавлять может владелец или его временный токен для Claude; править и удалять только владелец. */
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  /** Описание формата и маршрутов: открытый адрес, чтобы десктопное приложение Claude узнало, что и куда отправлять. */
  @Get('format')
  @Public()
  format() {
    return MATERIALS_FORMAT
  }

  @Get()
  @Owner()
  @InboxRead()
  list() {
    return this.materials.list()
  }

  @Post()
  @Owner()
  @InboxWrite()
  add(@Body() body: unknown) {
    return this.materials.add(body)
  }

  @Patch(':id')
  @Owner()
  status(@Param('id') id: string, @Body() body: unknown) {
    return this.materials.setStatus(id, body)
  }

  @Patch(':id/items/:index')
  @Owner()
  itemDone(@Param('id') id: string, @Param('index') index: string, @Body() body: unknown) {
    return this.materials.setItemDone(id, Number(index), body)
  }

  @Delete(':id')
  @Owner()
  remove(@Param('id') id: string) {
    return this.materials.remove(id)
  }
}
