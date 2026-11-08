import { BadRequestException, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { Owner, Public } from '../auth/auth.js'
import { DictService } from './dict.service.js'

@Controller('dict')
export class DictController {
  constructor(private readonly dict: DictService) {}

  /** Открытый поиск по большому словарю (корейский, русский, спряжённые формы). */
  @Public()
  @Get('search')
  search(@Query('q') q = '', @Query('level') level?: string, @Query('pos') pos?: string, @Query('offset') offset = '0') {
    if (!/^\d{1,4}$/.test(offset)) throw new BadRequestException({ error: 'неверное смещение' })
    return this.dict.search(q, { level, pos, offset: Number(offset) })
  }

  /** Открытая страница слова: все омонимы и слова, где оно встречается. */
  @Public()
  @Get('word/:word')
  word(@Param('word') word: string) {
    return this.dict.word(word)
  }

  /** Адреса всех слов для карты сайта (читает Nuxt при сборке sitemap.xml). Слова с пробелом (выражения) не включаются: у них неудобные адреса. */
  @Public()
  @Get('sitemap')
  sitemap() {
    return this.dict.sitemap()
  }

  @Owner()
  @Get('status')
  status() {
    return this.dict.status()
  }

  /** Пересобирает индекс из krdict_ko_ru.json (путь в DICT_FILE или `<DATA_DIR>/krdict_ko_ru.json`). */
  @Owner()
  @Post('reindex')
  reindex() {
    return this.dict.reindex()
  }
}
