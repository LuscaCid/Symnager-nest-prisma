import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class RegisterBodyDTO {
  @IsNotEmpty()
  @Length(3, 12)
  username: string;
  @IsEmail({}, { message: 'Precisa ser um email correto.' })
  email: string;
  password: string;
}
