import { Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { ClientService } from './Clients/Client.service';
import { ClientsControllers } from './Clients/Client.contoller';
import { SessionModule } from './Sessions/Session.module';
import { ClientModule } from './Clients/Clients.module';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    SessionModule, 
    ClientModule, 
    PrismaModule
  ],
})
export class AppModule {
  
}
