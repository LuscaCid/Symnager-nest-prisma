import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { loadConfig } from '../config/env';
import {
  ALLOW_INTERNAL_KEY,
  AuthUser,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from './decorators';
import { Role } from './enums';
import { getRequestContext } from './request-context';

export type JwtPayload = {
  sub: number;
  username: string;
  role: Role;
  sid?: number;
  /** Nuvem: cliente dono da sessão. Tem de bater com a licença da requisição. */
  tid?: number;
};

/** Compara o header com INTERNAL_TOKEN em tempo constante. Sem o env, sempre falso. */
function isValidInternalToken(header: string | string[] | undefined): boolean {
  const expected = loadConfig().internalToken;
  if (!expected || typeof header !== 'string') return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const allowInternal = this.reflector.getAllAndOverride<boolean>(
      ALLOW_INTERNAL_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      allowInternal &&
      isValidInternalToken(request.headers['x-internal-token'])
    ) {
      request.user = {
        user_id: null,
        username: 'system',
        name: 'Sistema',
        role: 'ADMIN',
        session_id: null,
        internal: true,
      };
      return true;
    }

    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    if (type !== 'Bearer' || !token)
      throw new UnauthorizedException('Token não informado.');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
    const tenant = getRequestContext().tenant;
    if (tenant && payload.tid !== tenant.id)
      throw new UnauthorizedException(
        'Sessão de outra empresa. Entre novamente.',
      );

    // Recarrega o usuário para que desativação/troca de papel valham na hora.
    const user = await this.prisma.users.findUnique({
      where: { user_id: Number(payload.sub) },
      select: {
        user_id: true,
        username: true,
        name: true,
        role: true,
        active: true,
      },
    });
    if (!user || !user.active)
      throw new UnauthorizedException('Usuário inativo ou inexistente.');

    request.user = {
      user_id: user.user_id,
      username: user.username,
      name: user.name,
      role: user.role as Role,
      session_id: payload.sid ?? null,
    };
    getRequestContext().user_id = user.user_id;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest().user as
      | AuthUser
      | undefined;
    if (!user) return true; // rota pública
    if (user.role === 'ADMIN' || roles.includes(user.role)) return true;
    throw new ForbiddenException('Você não tem permissão para esta ação.');
  }
}
