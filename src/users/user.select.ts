import { Prisma } from '@prisma/client';

/** Campos de usuário que podem sair da API (nunca senha/lockout). */
export const USER_SELECT = {
  user_id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  active: true,
  phone: true,
  last_login_at: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.usersSelect;

/** Campos visíveis para não-administradores (ex.: select de técnicos). */
export const USER_PUBLIC_SELECT = {
  user_id: true,
  name: true,
  username: true,
  role: true,
  active: true,
} satisfies Prisma.usersSelect;

/** Forma curta usada dentro de outras entidades ({ user_id, name }). */
export const USER_REF = { select: { user_id: true, name: true } } as const;
