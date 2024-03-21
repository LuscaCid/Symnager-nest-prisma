import { Module } from '@nestjs/common';
import { ClientModule } from './Clients/Clients.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { OrdersModule } from './Orders/orders.module';
import { VerifyUserInRequest } from './auth/revoke-request';

@Module({
  imports: [AuthModule, ClientModule, PrismaModule, OrdersModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide : APP_INTERCEPTOR,
      useClass : VerifyUserInRequest
    }
  ],
})
export class AppModule {}
