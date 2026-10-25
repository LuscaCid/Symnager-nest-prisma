/** Arredonda valores monetários para 2 casas (evita 0.1 + 0.2 = 0.30000000000000004). */
export const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
