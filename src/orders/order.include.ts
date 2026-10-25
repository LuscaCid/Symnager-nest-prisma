import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { USER_REF } from '../users/user.select';

export const ORDER_LIST_INCLUDE = {
  owner: {
    select: {
      client_id: true,
      name: true,
      phone: true,
      email: true,
      document: true,
    },
  },
  technician: USER_REF,
  created_by: USER_REF,
  tags: { select: { tag_id: true, slug: true } },
} satisfies Prisma.ordersInclude;

export const ORDER_DETAIL_INCLUDE = {
  ...ORDER_LIST_INCLUDE,
  items: { orderBy: { item_id: 'asc' } },
  payments: { orderBy: { paid_at: 'asc' }, include: { user: USER_REF } },
  history: { orderBy: { created_at: 'asc' }, include: { user: USER_REF } },
  failures: { orderBy: { occurred_at: 'desc' }, include: { user: USER_REF } },
} satisfies Prisma.ordersInclude;

/** Remove FKs redundantes de relações aninhadas (user_id junto de user). */
export function serializeOrder<T extends Record<string, unknown>>(order: T): T {
  const strip = (rows: unknown) =>
    Array.isArray(rows) ? rows.map(({ user_id: _u, ...rest }) => rest) : rows;
  const out: Record<string, unknown> = { ...order };
  for (const key of ['payments', 'history'])
    if (key in out) out[key] = strip(out[key]);
  if ('checklist' in out) out.checklist = parseChecklist(out.checklist);
  if ('custom_fields' in out)
    out.custom_fields = parseCustomFields(out.custom_fields);
  return out as T;
}

export type CustomFieldValues = Record<
  string,
  string | number | boolean | null
>;

/** custom_fields é gravado como JSON (String) e sai da API como objeto. */
export function parseCustomFields(value: unknown): CustomFieldValues {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

/** Remove vazios; objeto sem valores vira null. */
export function stringifyCustomFields(
  values: CustomFieldValues | null | undefined,
) {
  if (!values) return null;
  const kept = Object.entries(values).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  return kept.length ? JSON.stringify(Object.fromEntries(kept)) : null;
}

/** checklist é gravado como JSON (String) e sai da API como array. */
export function parseChecklist(value: unknown) {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyChecklist(
  items:
    | { item: string; ok: boolean | null; note?: string | null }[]
    | null
    | undefined,
) {
  if (!items?.length) return null;
  return JSON.stringify(
    items.map(({ item, ok, note }) => ({
      item,
      ok,
      ...(note ? { note } : {}),
    })),
  );
}

// Sem caracteres ambíguos (0/O, 1/I/L) para leitura e digitação.
const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateTrackingCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++)
    code += TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)];
  return code;
}
