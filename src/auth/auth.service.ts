import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IUser } from './interface/User.interface';
import { UserRegistrationType } from 'src/auth/interface/Service-interface';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class AuthService {
  constructor (private prisma : PrismaService , private readonly jwtService : JwtService) {}

  async SignInToken(data : IUser) {
    const payload = {sub : data.user_id, username : data.username, email : data.email}
    return await this.jwtService.signAsync(payload)
  }

  async findByEmail (email : string, options : {optionalData : boolean}) {
    try {
      //i need to verify email that was sent is already in use 
      const userFoundByEmail = await this.prisma.users.findFirst({
        where : {email},
        select : {
          email : true, 
          user_id : options.optionalData, 
          username : options.optionalData,
          password : options.optionalData
        }
      })
      return userFoundByEmail
    } catch (err) {
      throw new UnauthorizedException(err)
    }
    
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
