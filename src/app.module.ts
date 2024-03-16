import { Module } from '@nestjs/common';
import { ClientModule } from './Clients/Clients.module';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [
    AuthModule, 
    ClientModule, 
    PrismaModule,   
  ],
  controllers: [],
  providers: [{
    provide : APP_GUARD ,
    useClass : AuthGuard
  }],
})
export class AppModule {}
