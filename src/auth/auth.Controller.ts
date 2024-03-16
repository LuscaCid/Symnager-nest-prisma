import { Body, Controller, ExecutionContext, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipAuth } from './config/contants';
import { RegisterBodyDTO } from 'src/auth/dtos/Regist-DTO';
import {hash} from "bcryptjs"
import { EmailLoginDTO } from 'src/auth/dtos/First-step-login';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthorizationController {
  constructor(private authService : AuthService, private readonly jwtService : JwtService) {}
  @SkipAuth()
  @Post("/signin")
  async createLogin(@Body() data : EmailLoginDTO) {
    const {email} = data
    const userFound = await this.authService.findByEmail(email)
    
    if(!userFound)throw new UnauthorizedException("Usuario nao encontrado!")
    const payload = await this.jwtService.signAsync(userFound)
    return {
      access_token : payload
    }
  }
  @SkipAuth() // i dont need to verify if token was passed in requisition cuz i want to register here
  @Post("/register")
  async createUser(@Body() data : RegisterBodyDTO) {
    const {email,password,username} = data

    const emailAlreadyInUseByUsers = await this.authService.findByEmail(email)
   
    if(emailAlreadyInUseByUsers) {
      throw new UnauthorizedException("E-mail ja cadastrado na aplicação.")
    }
    const encyptPassword = await hash(password, 8)
    
    const user_id = await this.authService.create({
      email,
      password : encyptPassword,
      username
    })
    return user_id
  }

}
