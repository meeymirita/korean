import { Controller, Get, Header } from '@nestjs/common'
import { Public } from '../auth/auth.js'
import { STUDY_GRAMMAR, STUDY_SENTENCES } from './study.data.js'

/**
 * Открытые списки для чтения (как /words.json): пройденная грамматика и все предложения сайта с переводом.
 * Данные собирает scripts/build-study-data.mjs из кода сайта; личного здесь нет, токен не нужен.
 */
@Controller('public')
export class StudyController {
  @Public()
  @Get('grammar')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=900')
  grammar() {
    return STUDY_GRAMMAR
  }

  @Public()
  @Get('sentences')
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=900')
  sentences() {
    return STUDY_SENTENCES
  }
}
