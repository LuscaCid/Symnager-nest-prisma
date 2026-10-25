import { Transform } from 'class-transformer';

/** "true"/"false"/"1"/"0" (query string) -> boolean. */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'sim'].includes(String(value).toLowerCase());
  });

/** Remove espaços nas pontas; string vazia vira null (campos opcionais). */
export const Trim = (emptyAsNull = true) =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    return v === '' && emptyAsNull ? null : v;
  });

/** Mantém só dígitos (CPF/CNPJ, CEP); vazio vira null. */
export const DigitsOnly = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.replace(/\D/g, '');
    return v === '' ? null : v;
  });

export const Lowercase = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** "A,B,C" -> ["A","B","C"] (query string). */
export const CsvToArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter(Boolean);
  });
