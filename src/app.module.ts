import { Module } from '@nestjs/common';
import { ClientModule } from './Clients/Clients.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';
import { OrdersModule } from './Orders/orders.module';

@Module({
  imports: [AuthModule, ClientModule, PrismaModule, OrdersModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
