import { Contains, IsNotEmpty } from "class-validator";

export class EmailLoginDTO{
  @IsNotEmpty()
  @Contains("@")
  @Contains(".")
  email : string
}