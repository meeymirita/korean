import { Module } from '@nestjs/common'
import { SiteImgController } from './siteimg.controller'
import { SiteImgService } from './siteimg.service'

@Module({ controllers: [SiteImgController], providers: [SiteImgService] })
export class SiteImgModule {}
