import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common'
import { Owner, Public } from '../auth/auth.js'
import { SearchClient } from './search.client.js'
import { PrivateSearchCategory, SearchCategory } from './search.types.js'

const CATEGORIES = new Set<SearchCategory>(['word', 'grammar', 'sentence', 'reference', 'letter', 'form', 'game'])

@Controller('search')
export class SearchController {
  constructor(private readonly searchClient: SearchClient) {}

  /** Ищет только по общедоступным учебным материалам. */
  @Public()
  @Get()
  search(@Query('q') query = '', @Query('offset') offset = '0', @Query('category') category?: string) {
    if (!/^\d{1,5}$/.test(offset)) throw new BadRequestException({ error: 'неверное смещение поиска' })
    if (category && !CATEGORIES.has(category as SearchCategory)) throw new BadRequestException({ error: 'неверная категория поиска' })
    return this.searchClient.search(query, Number(offset), category as SearchCategory | undefined)
  }

  /** Ищет заметки или изображения кабинета; текст личных документов не возвращается. */
  @Owner()
  @Get('private')
  privateSearch(@Query('q') query = '', @Query('category') category = '') {
    if (category !== 'note' && category !== 'image') throw new BadRequestException({ error: 'неверная категория личного поиска' })
    return this.searchClient.searchPrivate(query, category as PrivateSearchCategory)
  }

  /** Вручную пересобирает закрытый индекс после восстановления базы из резервной копии. */
  @Owner()
  @Post('private/reindex')
  reindexPrivate() {
    return this.searchClient.reindexPrivate()
  }

  /** Показывает техническое состояние поискового индекса только владельцу. */
  @Owner()
  @Get('status')
  status() {
    return this.searchClient.status()
  }

  /** Полностью пересобирает индекс из переданного публичного каталога; доступно только владельцу. */
  @Owner()
  @Post('reindex')
  reindex(@Body() documents: unknown) {
    return this.searchClient.reindex(documents)
  }
}
