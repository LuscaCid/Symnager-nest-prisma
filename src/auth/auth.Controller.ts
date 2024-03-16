import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipAuth } from './config/contants';
import { RegisterBodyDTO } from 'src/auth/dtos/Regist-DTO';
import {hash , compare} from "bcryptjs"
import { EmailLoginDTO } from 'src/auth/dtos/First-step-login';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { PasswordDTO } from './dtos/PasswordDTO.dto';

@Controller('auth')
export class AuthorizationController {
  constructor(private authService : AuthService, private readonly jwtService : JwtService) {}
  
  @SkipAuth()
  @Post("/email")
  async createLogin(@Body() data : EmailLoginDTO) {
    const {email} = data
    const userFound = await this.authService.findByEmail(email, { optionalData : false})
    
    if(!userFound)throw new UnauthorizedException("Usuario nao encontrado!")

    const payload = await this.jwtService.signAsync(userFound)
    return {
      access_token : payload
    }
  }
  @UseGuards(AuthGuard)
  @Post("/password")
  async signinPassword(@Req() PasswordDTO : PasswordDTO) {//password comes from body and token from header, but in middleware i'll inject inside request.user the payload after validating if is an email existing inside db
    const { user : {email} } = PasswordDTO

    const {password} = PasswordDTO.body
    
    const userAllData = await this.authService.findByEmail(email, {optionalData : true})
    
    const isCorrect = await compare(password, userAllData.password)
    if(!isCorrect)throw new UnauthorizedException("Senha inválida.")
    
    const payload = await this.jwtService.signAsync(userAllData)
    return {
      access_token : payload,
      user : userAllData
    }
  }

  @SkipAuth() // i dont need to verify if token was passed in requisition cuz i want to register here
  @Post("/register")
  async createUser(@Body() data : RegisterBodyDTO) {
    const {email,password,username} = data

    const emailAlreadyInUseByUsers = await this.authService.findByEmail(email, { optionalData : false })
    console.log(emailAlreadyInUseByUsers)
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
