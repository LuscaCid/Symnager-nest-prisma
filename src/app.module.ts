import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaService } from './database/prisma.service';
import { ClientService } from './repository/prisma/ClientService';
import { EnsureAuthenticated } from './middleware/EnsureAuth';
import { ClientsControllers } from './Controllers/Client.contoller';
import { SessionController } from './Controllers/Session.controller';
import { SessionService } from './repository/prisma/Session-service';

@Module({
  imports: [],
  controllers: [AppController, ClientsControllers, SessionController],
  providers: [PrismaService, ClientService, SessionService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(EnsureAuthenticated).forRoutes(AppController)
  }
}
