import { Global, Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthGuard } from './auth.guard.js'
import { AuthService } from './auth.service.js'
import { ConfirmService } from './confirm.service.js'
import { RateLimiter } from '../security.js'
import { RoleHeadersInterceptor } from './role-headers.interceptor.js'
import { SessionController } from './session.controller.js'
import { MailService } from '../mail/mail.service.js'
import { TwoFaController } from './twofa.controller.js'
import { TwoFaService } from './twofa.service.js'

@Global()
@Module({
  controllers: [SessionController, TwoFaController],
  providers: [
    AuthService,
    MailService,
    TwoFaService,
    ConfirmService,
    RateLimiter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RoleHeadersInterceptor },
  ],
  exports: [AuthService, ConfirmService, RateLimiter, MailService, TwoFaService],
})
export class AuthModule {}
