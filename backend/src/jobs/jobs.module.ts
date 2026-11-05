import { Global, Module } from '@nestjs/common'
import { BackgroundJobs } from './background-jobs.service.js'

@Global()
@Module({ providers: [BackgroundJobs], exports: [BackgroundJobs] })
export class JobsModule {}
