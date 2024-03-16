import { Request } from "express";
import { UserInsideToken } from "src/Clients/interfaces/token";

export interface PasswordDTO extends Request {
  body : {
    password : string
  }
  
  user : UserInsideToken
  
}