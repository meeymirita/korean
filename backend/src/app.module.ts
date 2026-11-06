import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AdminModule } from './admin/admin.module.js'
import { AuthModule } from './auth/auth.module.js'
import { ChatModule } from './chat/chat.module.js'
import { DbModule } from './db/db.module.js'
import { ErrorFilter } from './error.filter.js'
import { EventsModule } from './events/events.module.js'
import { GuestsModule } from './guests/guests.module.js'
import { HealthController } from './health.controller.js'
import { ImagesModule } from './images/images.module.js'
import { NotesModule } from './notes/notes.module.js'
import { PlansModule } from './plans/plans.module.js'
import { SiteImgModule } from './siteimg/siteimg.module.js'
import { PublicModule } from './public/public.module.js'
import { DigestModule } from './digest/digest.module.js'
import { ReminderModule } from './reminders/reminder.module.js'
import { LessonModule } from './lesson/lesson.module.js'
import { SetsModule } from './sets/sets.module.js'
import { ProgressModule } from './progress/progress.module.js'
import { MetricsController } from './metrics.controller.js'
import { ContainerMetrics } from './container-metrics.service.js'
import { MetricsService } from './metrics.service.js'
import { SearchModule } from './search/search.module.js'
import { JobsModule } from './jobs/jobs.module.js'
import { YaDiskModule } from './yadisk/yadisk.module.js'

@Module({
  imports: [YaDiskModule, JobsModule, DbModule, EventsModule, AuthModule, GuestsModule, NotesModule, ProgressModule, ImagesModule, PlansModule, ChatModule, SetsModule, PublicModule, SiteImgModule, ReminderModule, LessonModule, DigestModule, AdminModule, SearchModule],
  controllers: [HealthController, MetricsController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }, MetricsService, ContainerMetrics],
})
export class AppModule {}
