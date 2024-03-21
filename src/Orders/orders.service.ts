import { Injectable, InternalServerErrorException, UploadedFile } from '@nestjs/common';
import { ServiceModel, DeleteReturn, GetOrdersReturn, UpdateReturn } from './interfaces/service';
import { OrderDTO, OrderReturn, Tags } from './dtos/orders.dto';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class OrdersService implements ServiceModel {
  constructor(private readonly prismaService : PrismaService) {}

  public async createOrder(orderDTO: OrderDTO): Promise<OrderReturn> {
    const { 
      user : {user_id : id},
      body : { description, device,owner_id,status,tags }
    } = orderDTO
    const {} = orderDTO.body
    console.log( device, owner_id )
    try {
      const orderResponse = await this.prismaService.orders.create({
        data : {
          description, 
          device, 
          status,
          owner : {connect : {client_id : owner_id}},
          created_by : {connect : { user_id  : id}} 
        }
      })
      console.log("passed")
      if(tags.length == 0)return orderResponse
      for(const tag of tags) {
        try {
          await this.prismaService.tags.create({
            data : {
              slug : tag,
              order : { connect : {order_id : orderResponse.order_id}}
            }
          })
        } catch(e) {
          console.log(e)
          throw new InternalServerErrorException(e)
        }
      }
      return orderResponse
    } catch (e) {
      console.error(e)

      throw new InternalServerErrorException(e)
    }
  }
  public async deleteOrder(id: number): Promise<DeleteReturn> { 
    try {
      const deleted = await this.prismaService.orders.delete({
        where : { order_id : id }
        
      })
      return deleted
    } catch (e) {
      throw new InternalServerErrorException(e)
    }
  }
  public async getOrders(q?: string): Promise<object> {
    let whereCondition : object | null = null
    if(q) {
      whereCondition = {
        where : {
          OR : [
            { description : {contains : q} },
            { device : {contains : q} },
            { status : {contains : q} }
          ]
        },
        select : {
          description : true,
          arrived_at : true,
          status : true,
          owner : {
            select : {
              name : true,
            }
          },
          created_by : {
            select : {
              username : true,
              email : true
            },

            tags : {
              select : {
                slug : true,
                tag_id : true  
              }
            }
          }
        }
      }
    } else {
      whereCondition = {
        select : {
          description : true,
          arrived_at : true,
          status : true,
          owner : {
            select : {
              name : true,
            }
          },
          created_by : {
            select : {
              username : true,
              email : true
            },
            tags : {
              select : {
                slug : true,
                tag_id : true  
              }
            }
            
          }
        },
          take: 20,
          orderBy: { created_at: 'asc' },
        }
    }
    
    try {
      const findOrders = await this.prismaService.orders.findMany(whereCondition)
      return findOrders
    } catch(e) {
      throw new InternalServerErrorException(e)
    }

  }
  public async updateOrder(updateData: OrderDTO, id : number): Promise<UpdateReturn> {
    const { body : { description, device, status } } = updateData
    try {
      const response = await this.prismaService.orders.update ({where : {order_id : id}, data : {
        description,
        device,
        status
      }})
      return response
    } catch (err) {
      throw new InternalServerErrorException(err)
    }
  }
  //patch route, only status is affected
  public async updateStatus({
    newStatus,
    id,
  }: {
    newStatus: string;
    id: number;
  }): Promise<UpdateReturn> {
    try {
      const response = await this.prismaService.orders.update({
        where : {  order_id : id} , data : { status : newStatus }
      })
      return response
    } catch (e) {
      throw new InternalServerErrorException(e)
    }
  }
}
