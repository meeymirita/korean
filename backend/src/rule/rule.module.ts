import { Module } from '@nestjs/common'
import { RuleController } from './rule.controller.js'
import { RuleService } from './rule.service.js'

@Module({ controllers: [RuleController], providers: [RuleService] })
export class RuleModule {}
