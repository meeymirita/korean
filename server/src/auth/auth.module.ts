import { Global, Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { ConfirmService } from './confirm.service'
import { RateLimiter } from '../security'
import { RoleHeadersInterceptor } from './role-headers.interceptor'
import { SessionController } from './session.controller'

@Global()
@Module({
  controllers: [SessionController],
  providers: [
    AuthService,
    ConfirmService,
    RateLimiter,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RoleHeadersInterceptor },
  ],
  exports: [AuthService, ConfirmService, RateLimiter],
})
export class AuthModule {}
