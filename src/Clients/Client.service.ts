import { PrismaService } from "src/database/prisma.service";
import { ClientRepositoryModel, CreateClientProperties, UpdateClientType } from "./interfaces/interface";
import { Injectable, InternalServerErrorException } from "@nestjs/common";

@Injectable()
export class ClientService implements ClientRepositoryModel {
  
  constructor(private prisma : PrismaService) {}
  
  async createClient(createDTO : CreateClientProperties, id : number): Promise<void|object> {
    try {
      const user = await this.prisma.clients.create({
      data : { ...createDTO,  created : {connect : {user_id : id}}  },
      
    })
    return user
    } catch (err) {
      console.error(err)
      return {err}
    }
  }

  async queryClients(query : string ) {
    const members = await this.prisma.clients.findMany(
      {
        where : {
          OR : [
              {
              name : {
                contains : query
              }
              },
              {
                cpf : {
                  contains : query
                }
              },
              {
                email : {
                  contains : query
              }
            } 
          ]
        },
        select : {
          name : true,
          email : true,
          created_at : true,
          district : true 
        }
      }
    )
    return members // array or members found in query
  }
   
  async updateClient(updateData : UpdateClientType, id : number) {

    try {
      return await this.prisma.clients.update({
        where : { client_id : id},
        data : updateData
      })
    } catch (e) {
      throw new InternalServerErrorException(e)
    }
  }
  async viewLatestClients (user_id? : string) { // filter by created by me its an option of filter, vai ter a query automatica
    try {
      const clientsHistory = await this.prisma.clients.findMany(
        {
          select : {
            client_id : true,
            email : true,
            name : true,
            
          } ,
          take : 1,
          orderBy : {created_at : "asc"}
        }
      )
      return clientsHistory 
    } catch(err) {
      return {err}
    }
  }
  async findByCpf(cpf: string): Promise<void | object> {
    const clientByCPF = await this.prisma.clients.findFirst({
      where : { cpf },
      select : { 
        cpf : true, 
        name : true, 
        email : true,  
        created_at : true 
      }
    })
    return clientByCPF
  }
  async findByEmail(email : string)  {
    const clientByEmail = await this.prisma.clients.findFirst({
      where : { email },
      select : { 
        cpf : true, 
        name : true, 
        email : true, 
        created_at : true 
      }
    })
    return clientByEmail
  }

}