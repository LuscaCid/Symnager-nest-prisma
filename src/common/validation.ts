import { registerDecorator, ValidationOptions } from 'class-validator';
import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

// Traduz as mensagens padrão do class-validator para português.
const MESSAGES: Record<string, (field: string) => string> = {
  isNotEmpty: (f) => `${f} é obrigatório.`,
  isDefined: (f) => `${f} é obrigatório.`,
  isString: (f) => `${f} deve ser um texto.`,
  isInt: (f) => `${f} deve ser um número inteiro.`,
  isNumber: (f) => `${f} deve ser um número.`,
  isPositive: (f) => `${f} deve ser maior que zero.`,
  isBoolean: (f) => `${f} deve ser verdadeiro ou falso.`,
  isEmail: (f) => `${f} deve ser um e-mail válido.`,
  isISO8601: (f) => `${f} deve ser uma data válida (ISO-8601).`,
  isDateString: (f) => `${f} deve ser uma data válida (ISO-8601).`,
  isArray: (f) => `${f} deve ser uma lista.`,
  isObject: (f) => `${f} deve ser um objeto.`,
  nestedValidation: (f) => `${f} é inválido.`,
  whitelistValidation: (f) => `O campo ${f} não é permitido.`,
};

function translate(field: string, key: string, original: string): string {
  if (MESSAGES[key]) return MESSAGES[key](field);
  // Mensagens customizadas (já em português) são mantidas.
  if (/[áéíóúâêôãõç]|deve|não/i.test(original)) return original;
  const m = (re: RegExp) => re.exec(original)?.[1];
  switch (key) {
    case 'isIn':
    case 'isEnum':
      return `${field} deve ser um destes valores: ${m(/values?: (.*)$/) ?? ''}`.trim();
    case 'min':
      return `${field} deve ser no mínimo ${m(/(-?\d+(?:\.\d+)?)/)}.`;
    case 'max':
      return `${field} deve ser no máximo ${m(/(-?\d+(?:\.\d+)?)/)}.`;
    case 'maxLength':
      return `${field} deve ter no máximo ${m(/(\d+) characters/)} caracteres.`;
    case 'minLength':
      return `${field} deve ter no mínimo ${m(/(\d+) characters/)} caracteres.`;
    case 'arrayMaxSize':
      return `${field} deve ter no máximo ${m(/(\d+) elements/)} itens.`;
    case 'matches':
      return `${field} está em formato inválido.`;
    default:
      return `${field} é inválido.`;
  }
}

function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(([key, msg]) =>
      translate(field, key, msg),
    );
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export const createValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(flatten(errors)),
  });

/** Valores dos campos adicionais da OS: { chave: texto | número | sim/não | null }. */
export function IsCustomFields(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCustomFields',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'custom_fields deve ser um objeto com até 20 campos (chaves a-z, 0-9 e _; textos de até 200 caracteres).',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length > 20) return false;
          return entries.every(
            ([key, v]) =>
              /^[a-z0-9_]{1,30}$/.test(key) &&
              (v === null ||
                typeof v === 'boolean' ||
                (typeof v === 'number' && Number.isFinite(v)) ||
                (typeof v === 'string' && v.length <= 200)),
          );
        },
      },
    });
}
