import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { Owner } from '../auth/auth.js'
import { ManhwaStateService } from './manhwa.state.js'

/**
 * /api/manhwa/_state: прогресс чтения на сервере (только владелец). Имя с «_» не совпадает ни с одной манхвой (имя папки начинается с буквы или цифры),
 * поэтому маршрут не пересекается с `GET /api/manhwa/<манхва>`; контроллер стоит в модуле раньше основного.
 */
@Owner()
@Controller('manhwa/_prefs')
export class ManhwaPrefsController {
  constructor(private readonly state: ManhwaStateService) {}

  /** Настройки вида читалки и полки (масштаб, размытие, порядок, две страницы) или `null`. */
  @Get()
  async get() {
    return { prefs: await this.state.prefs() }
  }

  /** Сохранить настройки; побеждает более позднее `at`, ответ это то, что теперь хранится. */
  @Put()
  save(@Body() body: unknown) {
    return this.state.savePrefs(body)
  }
}

@Owner()
@Controller('manhwa/_state')
export class ManhwaStateController {
  constructor(private readonly state: ManhwaStateService) {}

  /** Состояние всех манхв: `{ <манхва>: { read, pos, at, status?, marks } }`. */
  @Get()
  all() {
    return this.state.all()
  }

  /** Сохранить состояние одной манхвы; ответ это то, что теперь хранится (если на сервере свежее, придёт оно). */
  @Put(':slug')
  save(@Param('slug') slug: string, @Body() body: unknown) {
    return this.state.save(slug, body)
  }
}
