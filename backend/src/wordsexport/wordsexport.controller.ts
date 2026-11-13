import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Owner } from '../auth/auth.js'
import { WordsExportService } from './wordsexport.service.js'

/** GET /api/words/export: CSV «моих слов» (только владелец, гостю 403). */
@Owner()
@Controller('words')
export class WordsExportController {
  constructor(private readonly words: WordsExportService) {}

  @Get('export')
  async export(@Res({ passthrough: true }) res: Response) {
    const { text, count } = await this.words.csv()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="my-words.csv"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Words-Count', String(count))
    return text
  }
}
