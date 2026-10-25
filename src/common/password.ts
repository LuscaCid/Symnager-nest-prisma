import * as bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
export const PASSWORD_MESSAGE =
  'A senha deve ter entre 8 e 72 caracteres, com ao menos 1 letra e 1 número.';

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const comparePassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);
