import { Module } from '@nestjs/common';
import { ClientService } from './Client.service';
import { ClientsControllers } from './Client.contoller';
@Module({
  controllers: [ClientsControllers],
  providers: [ClientService],
})
export class ClientModule {}
