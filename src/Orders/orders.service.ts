import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ServiceModel } from './interfaces/service';
import { OrderDTO, Order, Tags, OrderReturn } from './dtos/orders.dto';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class OrdersService implements ServiceModel {
  constructor(private readonly prismaService : PrismaService) {}

  public async createOrder(orderDTO: OrderDTO): Promise<OrderReturn> {
    const { description,device,owner_id,status,tags } = orderDTO
    try {
      const orderResponse = await this.prismaService.orders.create({
        data : {
          description, device, owner_id, status 
        }
      })
      for(const tag of tags) {
        console.log(tag)
        this.prismaService.tags.create({
          data : {
            slug : tag.slug,
            tags_has_orders_id : orderResponse.order_id
          }
        })
      } 
      return orderResponse
    } catch (e) {
      throw new InternalServerErrorException(e)
    }
  }
  public async deleteOrder(id: number): Promise<void> {

  }
  public async getOrders(q?: string): Promise<Order[]> {

  }
  public async updateOrder(updateData: Partial<OrderDTO>): Promise<Order> {

  }
  
  public updateStatus({
    newStatus,
    id,
  }: {
    newStatus: string;
    id: number;
  }): Promise<Order> {}
}
