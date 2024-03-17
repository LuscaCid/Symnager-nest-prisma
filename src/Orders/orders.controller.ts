import { Body, Controller, Post } from '@nestjs/common';
import { OrderDTO } from './dtos/orders.dto';

@Controller('orders')
export class OrdersControllers {
  @Post('create')
  async createOrder(@Body() data: OrderDTO) {}
}
