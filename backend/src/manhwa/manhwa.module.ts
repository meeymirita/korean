import { Module } from '@nestjs/common'
import { ManhwaController } from './manhwa.controller.js'
import { ManhwaPrefsController, ManhwaStateController } from './manhwa.state.controller.js'
import { ManhwaStateService } from './manhwa.state.js'

// ManhwaPrefsController и ManhwaStateController раньше основного: `manhwa/_state` не должен попасть в `manhwa/:slug`
@Module({ controllers: [ManhwaPrefsController, ManhwaStateController, ManhwaController], providers: [ManhwaStateService] })
export class ManhwaModule {}
