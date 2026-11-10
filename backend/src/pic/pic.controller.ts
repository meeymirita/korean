import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from '../auth/auth.js'
import { DISK_DIRS, YaDiskService } from '../yadisk/yadisk.service.js'

/** Картинки карточек грамматики: lesson-3.webp (урок части 1) и own-hago.webp (своя карточка по id). */
const NAME = /^(lesson-\d{1,2}|own-[a-z0-9_]+)\.webp$/

/** GET /api/pic/grammar/own-hago.webp: файл лежит на Яндекс.Диске в папке korean_grammar, браузер уходит на временную ссылку Диска. Открыто всем, как и сама грамматика. */
@Controller('pic')
export class PicController {
  constructor(private readonly disk: YaDiskService) {}

  @Public()
  @Get('grammar/:name')
  async grammar(@Param('name') name: string, @Query('fresh') fresh: string | undefined, @Res() res: Response) {
    if (!NAME.test(name) || !this.disk.configured()) throw new NotFoundException({ error: 'not found' })
    let href: string
    try {
      // ?fresh=…: картинка не загрузилась (файл на Диске заменили, ссылка из памяти ведёт на старый), сайт просит новую ссылку
      href = await this.disk.cachedLink(`${DISK_DIRS.grammar}/${name}`, !!fresh)
    } catch {
      throw new NotFoundException({ error: 'not found' })
    }
    res.setHeader('Cache-Control', fresh ? 'no-store' : 'public, max-age=600')
    res.redirect(302, href)
  }
}
