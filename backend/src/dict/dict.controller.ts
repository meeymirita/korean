import { BadRequestException, Controller, Get, Header, Param, Post, Query } from '@nestjs/common'
import { Owner, Public } from '../auth/auth.js'
import { DictService } from './dict.service.js'

@Controller('dict')
export class DictController {
  constructor(private readonly dict: DictService) {}

  /** Открытый поиск по большому словарю (корейский, русский, спряжённые формы). */
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @Get('search')
  search(@Query('q') q = '', @Query('level') level?: string, @Query('pos') pos?: string, @Query('offset') offset = '0') {
    if (!/^\d{1,4}$/.test(offset)) throw new BadRequestException({ error: 'неверное смещение' })
    return this.dict.search(q, { level, pos, offset: Number(offset) })
  }

  /** Список всех слов для меню слева («слово: перевод»), по популярности или по алфавиту. */
  @Public()
  @Header('Cache-Control', 'public, max-age=300')
  @Get('list')
  list(@Query('order') order?: string, @Query('level') level?: string, @Query('pos') pos?: string, @Query('offset') offset = '0', @Query('limit') limit = '60') {
    if (!/^\d{1,5}$/.test(offset) || !/^\d{1,3}$/.test(limit)) throw new BadRequestException({ error: 'неверное смещение или размер' })
    return this.dict.list({ order, level, pos, offset: Number(offset), limit: Number(limit) })
  }

  /** Папки меню «Все слова»: число слов по уровням и по частям речи. */
  @Public()
  @Header('Cache-Control', 'public, max-age=600')
  @Get('folders')
  folders() {
    return this.dict.folders()
  }

  /** Открытая страница слова: все омонимы и слова, где оно встречается. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('word/:word')
  word(@Param('word') word: string) {
    return this.dict.word(word)
  }

  /** Адреса всех слов для карты сайта (читает Nuxt при сборке sitemap.xml). Слова с пробелом (выражения) не включаются: у них неудобные адреса. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600')
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
