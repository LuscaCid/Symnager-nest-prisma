// CSV para Excel pt-BR: separador ";", vírgula decimal, UTF-8 com BOM.

export type CsvColumn<T> = [header: string, value: (row: T) => unknown];

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'number') text = String(value).replace('.', ',');
  else if (typeof value === 'boolean') text = value ? 'Sim' : 'Não';
  else text = String(value);
  // Neutraliza fórmulas (CSV injection) e escapa aspas.
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const BOM = String.fromCharCode(0xfeff);

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map(([h]) => cell(h)).join(';')];
  for (const row of rows)
    lines.push(columns.map(([, get]) => cell(get(row))).join(';'));
  return BOM + lines.join('\r\n') + '\r\n';
}
