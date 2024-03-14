import { Body, Controller, Post, Req } from "@nestjs/common";
import { Request } from "express";
const { hash } = require("bcryptjs")
import { RegisterBodyDTO } from "src/dtos/User-register-boyd";
import { SessionService } from "src/repository/prisma/Session-service";

@Controller("session")
export class SessionController {
  constructor(private SessionService : SessionService ) {}


  @Post("/auth/register")
  async createUser(@Body() data : RegisterBodyDTO) {
    const {email,password,username} = data
    const emailAlreadyInUseByUsers = await this.SessionService.findByEmail(email)
    console.log(emailAlreadyInUseByUsers)
    if(emailAlreadyInUseByUsers) {
      return {
        email, message: "E=mail ja cadastrado na aplicacao."
      }
    }
    const encyptPassword = await hash(password, 8)
    const user_id = await this.SessionService.create({
      email,
      password,
      username
    })
    return user_id
  }
}