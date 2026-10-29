import { Global, Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { RoleHeadersInterceptor } from './role-headers.interceptor'

@Global()
@Module({
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RoleHeadersInterceptor },
  ],
  exports: [AuthService],
})
export class AuthModule {}
