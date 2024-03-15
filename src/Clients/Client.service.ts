import { PrismaService } from "src/database/prisma.service";
import { ClientRepositoryModel, CreateClientProperties, UpdateClientType } from "./interfaces/interface";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ClientService implements ClientRepositoryModel {
  
  constructor(private prisma : PrismaService) {}
  
  async create({name, city,cpf,district,email,phone,state,street,zipcode} : CreateClientProperties): Promise<void|object> {
    try {
      const user = await this.prisma.clients.create({
      data : { name, cpf, email, phone, city, district, state, street, zipcode }
    })
    return user
    } catch (err) {
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
  async updateClient(udateSection : UpdateClientType) {
    
  }
  async viewLatestClients () {
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
      select : { cpf : true, name : true, email : true,  created_at : true }
    })
    return clientByCPF
  }
  async findByEmail(email : string)  {
    const clientByEmail = await this.prisma.clients.findFirst({
      where : { email },
      select : { cpf : true, name : true, email : true, created_at : true }
    })
    return clientByEmail
  }
}