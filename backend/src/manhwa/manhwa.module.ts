import { Module } from '@nestjs/common'
import { ManhwaController } from './manhwa.controller.js'
import { ManhwaStateController } from './manhwa.state.controller.js'
import { ManhwaStateService } from './manhwa.state.js'

// ManhwaStateController раньше основного: `manhwa/_state` не должен попасть в `manhwa/:slug`
@Module({ controllers: [ManhwaStateController, ManhwaController], providers: [ManhwaStateService] })
export class ManhwaModule {}
