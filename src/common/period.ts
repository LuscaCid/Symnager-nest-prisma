/** "2026-10-24" como limite superior inclui o dia inteiro. */
export function endOfDayIfDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999Z`)
    : new Date(value);
}

/** Período [from, to]; sem `from`, volta `defaultDays` dias a partir de `to`. */
export function resolvePeriod(from?: string, to?: string, defaultDays = 30) {
  const end = to ? endOfDayIfDate(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - defaultDays * 86400_000);
  return { from: start, to: end };
}

/** YYYY-MM-DD (UTC). */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Segunda-feira da semana de `d`, como YYYY-MM-DD. */
export function weekKey(d: Date) {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = segunda
  date.setUTCDate(date.getUTCDate() - weekday);
  return dayKey(date);
}

/** Conta ocorrências por chave e devolve [{ key, count }] em ordem decrescente. */
export function countBy<T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
  limit?: number,
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const k = key(row) || 'Não informado';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const list = [...map.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
  return limit ? list.slice(0, limit) : list;
}
