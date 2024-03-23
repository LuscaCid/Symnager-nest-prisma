import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { OrderDTO, UpdateOrderDTO } from './dtos/orders.dto';
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
      data: response,
    };
  }
  @HttpCode(200)
  @Delete('/delete')
  async deleteOrder(@Req() orderID: string) {
    const response = await this.ordersService.deleteOrder(Number(orderID));
    return {
      message: 'Excluido com sucesso',
      deletedObject: response,
    };
  }
  @HttpCode(204)
  @Patch("status")
  public async updateStatus(@Query() query : {id : number, newStatus : string}) {
    const { id, newStatus } = query
    const res = await this.ordersService.updateStatus({id, newStatus})
    return {
      response : res
    }
  }
  @Put("update")
  public async updateData(@Req() bodyData : UpdateOrderDTO) {
    const { body } = bodyData
    const response = await this.ordersService.updateOrder( body )
    return {
      message : "Atualizado",
      response : response
    }
  }
}
