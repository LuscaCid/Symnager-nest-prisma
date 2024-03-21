import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Observable } from 'rxjs';
import authConfig from './config/auth.config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_STEP } from './config/contants';
import { UserInsideToken } from 'src/Clients/interfaces/token';
@Injectable()
export class VerifyUserInRequest implements NestInterceptor {
  constructor(
    private readonly jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    const isPublicStep = this.reflector.getAllAndOverride(IS_PUBLIC_STEP, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublicStep) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const [, token] = request.headers.authorization.split(' ');
    const datainsidetoken: UserInsideToken = this.jwtService.verify(token, {
      secret: authConfig.jwtSecret,
    });

    const { email, user_id, username } = datainsidetoken;
    if (!email || !user_id || !username)
      throw new UnauthorizedException('Usuario nao authenticado corretamente.');
    return next.handle();
  }
}
