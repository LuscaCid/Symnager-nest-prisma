import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CommentDto,
  CreateOrderDto,
  CreatePaymentDto,
  ItemInputDto,
  OrdersQueryDto,
  PrintDto,
  UpdateItemDto,
  UpdateOrderDto,
  UpdateStatusDto,
} from './orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: OrdersQueryDto) {
    return this.orders.list(query);
  }

  @Get('board')
  board() {
    return this.orders.board();
  }

  @Post()
  @Roles('ATENDENTE')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findById(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.update(id, dto, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.updateStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.orders.remove(id, user);
  }

  @Post(':id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ItemInputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.addItem(id, dto, user);
  }

  @Put(':id/items/:itemId')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.updateItem(id, itemId, dto, user);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.removeItem(id, itemId, user);
  }

  @Post(':id/payments')
  @Roles('ATENDENTE')
  addPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.addPayment(id, dto, user);
  }

  @Delete(':id/payments/:paymentId')
  @Roles('ATENDENTE')
  removePayment(
    @Param('id', ParseIntPipe) id: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.removePayment(id, paymentId, user);
  }

  @Post(':id/comments')
  comment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.comment(id, dto, user);
  }

  @Post(':id/print')
  print(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrintDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.print(id, dto, user);
  }
}
