import { IsEmail, IsNotEmpty, IsOptional, Length, MinLength } from "class-validator"
import { Request } from "express"
import { CreateClientProperties } from "src/Clients/interfaces/interface"
import { UserInsideToken } from "../interfaces/token"

export interface RequestCreateClient extends Request {
  user : UserInsideToken
  body : CreateClientProperties
}
export class QueryClientParams {
  @IsNotEmpty()
  name : string
} 