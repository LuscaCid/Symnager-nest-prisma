import { IsNotEmpty } from "class-validator";

export class EmailDTO {
  @IsNotEmpty()
  email : string
}