import { Body, Controller, Post, Req, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { hash } from "bcrypt"
import { sign,  } from "jsonwebtoken"
import { RegisterBodyDTO } from "src/Users/User-register-boyd";
import { SessionService } from "src/Sessions/Session.service";

@Controller("session")
export class SessionController {
  constructor(private SessionService : SessionService ) {}


  @Post("/auth/register")
  async createUser(@Body() data : RegisterBodyDTO) {
    const {email,password,username} = data
    const emailAlreadyInUseByUsers = await this.SessionService.findByEmail(email)
    console.log(emailAlreadyInUseByUsers)
    if(emailAlreadyInUseByUsers) {
      throw new UnauthorizedException({}, "E-mail ja cadastrado na aplicação.")
    }
    const encyptPassword = await hash(password, 8)
    const user_id = await this.SessionService.create({
      email,
      password : encyptPassword,
      username
    })
    return user_id
  }
}