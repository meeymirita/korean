import { BadRequestException, Body, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { Owner, Public } from '../auth/auth.js'
import { isInternal } from '../security.js'
import { DictService } from './dict.service.js'
import { DictVisits } from './dict.visits.service.js'

@Controller('dict')
export class DictController {
  constructor(private readonly dict: DictService, private readonly visits: DictVisits) {}

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

  /** Подборки слов: список. */
  @Public()
  @Header('Cache-Control', 'public, max-age=600')
  @Get('collections')
  collections() {
    return this.dict.collections()
  }

  /** Одна подборка слов (топ-100, глаголы, темы). */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('collection/:slug')
  collection(@Param('slug') slug: string) {
    return this.dict.collection(slug)
  }

  /** Счётчики открытого алфавитного указателя. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600')
  @Get('alphabet-index')
  alphabetIndex() {
    return this.dict.alphabetIndex()
  }

  /** Слова с выбранной начальной согласной или слогом. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('alphabet/:initial')
  alphabet(@Param('initial') initial: string, @Query('offset') offset = '0') {
    if (!/^\d{1,5}$/.test(offset)) throw new BadRequestException({ error: 'неверное смещение' })
    return this.dict.alphabet(initial, Number(offset))
  }

  /** Открытая страница слова: все омонимы и слова, где оно встречается. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('word/:word')
  word(@Param('word') word: string) {
    return this.dict.word(word)
  }

  /** Страница «X по-корейски»: слова с точным русским переводом X (открытая, как и страница слова). */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Get('ru-word/:q')
  ruWord(@Param('q') q: string) {
    return this.dict.ruWord(q)
  }

  /** Указатель русско-корейских страниц: самые частые русские слова. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600')
  @Get('ru-index')
  ruIndex() {
    return this.dict.ruIndex()
  }

  /** Адреса всех слов для карты сайта (читает Nuxt при сборке sitemap.xml). Слова с пробелом (выражения) не включаются: у них неудобные адреса. */
  @Public()
  @Header('Cache-Control', 'public, max-age=3600')
  @Get('sitemap')
  sitemap() {
    return this.dict.sitemap()
  }

  /**
   * Учёт захода на страницу словаря или подборки. Зовёт только серверная часть сайта (nitro/utils/dictVisit.ts) из внутренней сети:
   * снаружи адрес отвечает 404, браузер сообщает о переходах сайту (`POST /dict-visit`), а не сюда. Ошибки учёта не ломают страницу: ответ 204.
   */
  @Public()
  @HttpCode(204)
  @Post('visit')
  async visit(@Req() req: Request, @Body() body: { path?: unknown; ua?: unknown; ref?: unknown }) {
    if (!isInternal(req)) throw new NotFoundException()
    await this.visits.record(body ?? {}).catch(() => false)
  }

  /** Итоги заходов за период (по умолчанию 30 дней): люди и роботы, по дням, страницы, источники. Только владелец. */
  @Owner()
  @Get('visits')
  summary(@Query('days') days = '30') {
    if (!/^\d{1,3}$/.test(days)) throw new BadRequestException({ error: 'неверное число дней' })
    return this.visits.summary(Number(days))
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
