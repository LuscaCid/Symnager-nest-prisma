import { IsEmail, IsNotEmpty, IsOptional, Length, MinLength } from "class-validator"
import { CreateClientProperties } from "src/repository/client-creation-interface"

export class CreateClientBody implements CreateClientProperties{
  @IsNotEmpty()
  @Length(3,30, {message : "o nome pode ter um minimo de 3 caracteres e um maximo de 30."})
  name: string
  
  @IsEmail({}, {message : "precisa ser um email valido."})
  email: string
  cpf: string
  phone: string
  
  city: string
  district: string
  state: string
  @IsOptional()
  street: string
  zipcode: string 

}

export class QueryClientParams {
  @IsNotEmpty()
  name : string
} 