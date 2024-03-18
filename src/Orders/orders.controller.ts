import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { OrderDTO } from './dtos/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersControllers {
  constructor (private ordersService : OrdersService) {}
  @HttpCode(201)
  @Post('create')
  async createOrder(@Body() data: OrderDTO) {
    const response = await this.ordersService.createOrder(data) 
    return { response }
  }
}
