import { Module } from '@nestjs/common'
import { SiteImgController } from './siteimg.controller.js'
import { SiteImgService } from './siteimg.service.js'

@Module({ controllers: [SiteImgController], providers: [SiteImgService] })
export class SiteImgModule {}
