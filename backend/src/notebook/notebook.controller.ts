import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { Owner } from '../auth/auth'
import { NotebookService } from './notebook.service'

/** /api/notebook: «Тетрадь» (папки и листы с рисунками), только для владельца. */
@Owner()
@Controller('notebook')
export class NotebookController {
  constructor(private readonly nb: NotebookService) {}

  /** Дерево без штрихов: папки и листы с названием, местом и шаблоном. */
  @Get()
  list() {
    return this.nb.list()
  }

  /** Один лист целиком: со штрихами и текстом. */
  @Get(':id')
  one(@Param('id') id: string) {
    return this.nb.one(id)
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.nb.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.nb.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nb.remove(id)
  }
}
