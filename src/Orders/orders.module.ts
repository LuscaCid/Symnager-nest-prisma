import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersControllers } from './orders.controller';

@Module({
  providers: [OrdersService],
  controllers: [OrdersControllers],
})
export class OrdersModule {}
