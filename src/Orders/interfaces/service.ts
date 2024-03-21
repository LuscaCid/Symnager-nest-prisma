import { PrismaService } from 'src/database/prisma.service';
import { Order, OrderDTO, OrderReturn } from '../dtos/orders.dto';

export type DeleteReturn = ReturnType<typeof prisma.orders.delete>
export type createReturn = ReturnType<typeof prisma.orders.create>
export type UpdateReturn = ReturnType<typeof prisma.orders.update>
export type GetOrdersReturn = ReturnType<typeof prisma.orders.findMany>
export type ClientsReturn = ReturnType<typeof prisma.clients.findFirst> 

export type test = Partial<GetOrdersReturn> 

export abstract class ServiceModel {
  public abstract createOrder(orderDTO: OrderDTO): Promise<OrderReturn>;
  public abstract getOrders(q?: string): Promise<object>;
  public abstract deleteOrder(id: number): Promise<DeleteReturn>;
  public abstract updateOrder(updateData: Partial<OrderDTO>, id : number): Promise<UpdateReturn>;
  public abstract updateStatus({
    newStatus,
    id,
  }: {
    newStatus: string;
    id: number;
  }): Promise<UpdateReturn>;
}
const prisma = new PrismaService()

