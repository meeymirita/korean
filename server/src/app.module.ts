import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AdminModule } from './admin/admin.module'
import { AuthModule } from './auth/auth.module'
import { DbModule } from './db/db.module'
import { ErrorFilter } from './error.filter'
import { EventsModule } from './events/events.module'
import { GuestsModule } from './guests/guests.module'
import { HealthController } from './health.controller'
import { ImagesModule } from './images/images.module'
import { NotesModule } from './notes/notes.module'
import { PlansModule } from './plans/plans.module'
import { PublicModule } from './public/public.module'
import { ReminderModule } from './reminders/reminder.module'
import { SetsModule } from './sets/sets.module'
import { ProgressModule } from './progress/progress.module'

@Module({
  imports: [DbModule, EventsModule, AuthModule, GuestsModule, NotesModule, ProgressModule, ImagesModule, PlansModule, SetsModule, PublicModule, ReminderModule, AdminModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}
