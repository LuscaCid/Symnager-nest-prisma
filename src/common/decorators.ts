import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Role } from './enums';

export const IS_PUBLIC_KEY = 'isPublic';
/** Rota acessível sem token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe a rota aos papéis informados (ADMIN sempre passa). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const ALLOW_INTERNAL_KEY = 'allowInternal';
/** Aceita também o header x-internal-token (processo principal do Electron). */
export const AllowInternalToken = () => SetMetadata(ALLOW_INTERNAL_KEY, true);

export type AuthUser = {
  user_id: number | null; // null = sistema (x-internal-token)
  username: string;
  name: string;
  role: Role;
  session_id: number | null;
  internal?: boolean;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
