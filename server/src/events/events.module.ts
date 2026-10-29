import { Global, Module } from '@nestjs/common'
import { Events } from './events.service'

@Global()
@Module({ providers: [Events], exports: [Events] })
export class EventsModule {}
