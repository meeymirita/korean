import { Global, Module } from '@nestjs/common'
import { YaDiskService } from './yadisk.service.js'

@Global()
@Module({ providers: [YaDiskService], exports: [YaDiskService] })
export class YaDiskModule {}
