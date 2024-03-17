import { Order, OrderDTO } from '../dtos/orders.dto';

export abstract class ServiceModel {
  public abstract createOrder(orderDTO: OrderDTO): Promise<Order>;
  public abstract getOrders(q?: string): Promise<Order[]>;
  public abstract deleteOrder(id: number): Promise<void>;
  public abstract updateOrder(updateData: Partial<OrderDTO>): Promise<Order>;
  public abstract updateStatus({
    newStatus,
    id,
  }: {
    newStatus: string;
    id: number;
  }): Promise<Order>;
}
