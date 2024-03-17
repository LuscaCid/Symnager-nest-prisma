import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import authConfig from 'src/auth/config/auth.config';
import { IS_PUBLIC_KEY } from 'src/auth/config/contants';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true; // estou resgatando um possivel decorator chamado (SkipAuth) para que eu possa informar se uma rota eh publica e nao precisa ser authenticada
    const request = context.switchToHttp().getRequest();

    const authorization = this.extractTokenFromHeaders(request);

    if (!authorization) throw new UnauthorizedException("Token don't passed.");
    try {
      const payload = await this.jwtService.verifyAsync(authorization, {
        secret: authConfig.jwtSecret,
      });
      request['user'] = payload;
    } catch (err) {
      throw new UnauthorizedException(err);
    }
    return true; //and it goes for the next function in execution, its the controller
  }

  private extractTokenFromHeaders(request: Request) {
    if (!request.headers.authorization) return undefined; // if only had nothin in authorization
    const [type, BearerToken] = request.headers.authorization?.split(' ');
    return type === 'Bearer' ? BearerToken : undefined;
    // its relevant to verify that is an bearer token that is passed in authorization inside request
  }
}
