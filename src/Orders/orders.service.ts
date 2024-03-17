import { Injectable } from '@nestjs/common';
import { ServiceModel } from './interfaces/service';
import { OrderDTO, Order } from './dtos/orders.dto';

@Injectable()
export class OrdersService implements ServiceModel {
  public createOrder(orderDTO: OrderDTO): Promise<Order> {}
  public deleteOrder(id: number): Promise<void> {}
  public getOrders(q?: string): Promise<Order[]> {}
  public updateOrder(updateData: Partial<OrderDTO>): Promise<Order> {}
  public updateStatus({
    newStatus,
    id,
  }: {
    newStatus: string;
    id: number;
  }): Promise<Order> {}
}
