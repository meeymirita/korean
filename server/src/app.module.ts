import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AuthModule } from './auth/auth.module'
import { DbModule } from './db/db.module'
import { ErrorFilter } from './error.filter'
import { EventsModule } from './events/events.module'
import { GuestsModule } from './guests/guests.module'
import { HealthController } from './health.controller'
import { NotesModule } from './notes/notes.module'

@Module({
  imports: [DbModule, EventsModule, AuthModule, GuestsModule, NotesModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}
