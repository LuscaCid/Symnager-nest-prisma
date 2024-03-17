import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipAuth } from './config/contants';
import { RegisterBodyDTO } from 'src/auth/dtos/Regist-DTO';
import { hash, compare } from 'bcryptjs';
import { EmailLoginDTO } from 'src/auth/dtos/First-step-login';
import { AuthService } from './auth.service';
import { PasswordDTO } from './dtos/PasswordDTO.dto';

@Controller('auth')
export class AuthorizationController {
  constructor(
    private authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @SkipAuth()
  @Post('/email')
  async createLogin(@Body() data: EmailLoginDTO) {
    const { email } = data;

    const userFound = await this.authService.findByEmail(email, false);
    if (!userFound) throw new UnauthorizedException('Usuario nao encontrado!');

    const payload = await this.jwtService.signAsync(userFound);
    return {
      access_token: payload, //only email token, it cannot provide access to application for this user
    };
  }
  @Post('/password')
  async signinPassword(@Req() PasswordDTO: PasswordDTO) {
    //password comes from body and token from header, but in middleware i'll inject inside request.user the payload after validating if is an email existing inside db
    const {
      user: { email },
    } = PasswordDTO; //email injected inside request.user

    const { password } = PasswordDTO.body;

    const userAllData = await this.authService.findByEmail(email, true);
    const emailEquals = userAllData.email === email;
    if (!emailEquals)
      throw new UnauthorizedException('emails nao combinam com as contas');

    const isCorrect = await compare(password, userAllData.password);
    if (!isCorrect) throw new UnauthorizedException('Senha inválida.');

    const payload = await this.jwtService.signAsync(userAllData);
    return {
      access_token: payload,
      user: userAllData,
    };
  }

  @SkipAuth() // i dont need to verify if token was passed in requisition cuz i want to register here
  @Post('/register')
  async createUser(@Body() data: RegisterBodyDTO) {
    const { email, password, username } = data;

    const emailAlreadyInUseByUsers = await this.authService.findByEmail(
      email,
      false,
    );
    if (emailAlreadyInUseByUsers) {
      throw new UnauthorizedException('E-mail ja cadastrado na aplicação.');
    }
    const encyptPassword = await hash(password, 8);

    const user_id = await this.authService.create({
      email,
      password: encyptPassword,
      username,
    });
    return user_id;
  }
}
