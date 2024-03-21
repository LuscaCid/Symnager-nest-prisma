import { Contains, IsNotEmpty } from 'class-validator';
import { Request } from 'express';

export class EmailLoginDTO {
  @IsNotEmpty()
  @Contains('@')
  @Contains('.')
  email: string;
}
