import { Injectable } from "@nestjs/common";
import { UserRegistrationType, UserServiceAbstraction } from "./interfaces/Service-interface";
import { PrismaService } from "src/database/prisma.service";


@Injectable() 
export class SessionService implements UserServiceAbstraction {

  constructor(private prisma : PrismaService) {}

  async findByEmail (email : string) {
    //i need to verify email that was sent is already in use 
    return await this.prisma.users.findFirst({where : {email}, select : {email : true}})
  }

  async create(data: UserRegistrationType): Promise<void | object> {    
    const { email,password,username } = data
    try {
      const client =  await this.prisma.users.create({
      data : { email,password,username }
    })
    return client
    } catch (e) {
      return {e}
    }
  }
}