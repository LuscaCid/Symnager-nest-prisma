import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { OrderDTO } from './dtos/orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersControllers {
  constructor(private ordersService: OrdersService) {}
  @HttpCode(201)
  @Post('create')
  async createOrder(@Req() data: OrderDTO) {
    console.log(data);
    const response = await this.ordersService.createOrder(data);
    return { response };
  }

  @HttpCode(202)
  @Get('view')
  async viewOrdersQuery(@Query() query: { q: string }) {
    const response = await this.ordersService.getOrders(query.q);
    return {
      message: `valor da query `,
      data: response,
    };
  }
  @Delete('/delete')
  async deleteOrder(@Req() orderID: string) {
    const response = await this.ordersService.deleteOrder(Number(orderID));
    return {
      message: 'Excluido com sucesso',
      deletedObject: response,
    };
  }
}
