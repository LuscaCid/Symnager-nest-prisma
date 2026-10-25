/**
 * Catálogo de planos. O mesmo conteúdo vive no servidor de licenças (symnager-admin),
 * que assina os limites dentro do token; este catálogo cobre tokens antigos sem `limits`.
 */
export type PlanLimits = {
  /** Pode conectar ao servidor em nuvem. */
  cloud: boolean;
  /** null = ilimitado. */
  max_users: number | null;
  max_orders_month: number | null;
  storage_mb: number | null;
  max_photos_per_order: number;
  max_machines: number;
  rate_per_minute: number | null;
};

export type PlanId =
  | 'VITALICIO'
  | 'BASICO'
  | 'INTERMEDIARIO'
  | 'PRO'
  | 'INTERNO';

export const PLANS: Record<PlanId, { name: string; limits: PlanLimits }> = {
  VITALICIO: {
    name: 'Vitalício',
    limits: {
      cloud: false,
      max_users: null,
      max_orders_month: null,
      storage_mb: null,
      max_photos_per_order: 10,
      max_machines: 1,
      rate_per_minute: null,
    },
  },
  BASICO: {
    name: 'Básico',
    limits: {
      cloud: true,
      max_users: 2,
      max_orders_month: 80,
      storage_mb: 2048,
      max_photos_per_order: 4,
      max_machines: 2,
      rate_per_minute: 120,
    },
  },
  INTERMEDIARIO: {
    name: 'Intermediário',
    limits: {
      cloud: true,
      max_users: 5,
      max_orders_month: 300,
      storage_mb: 10240,
      max_photos_per_order: 8,
      max_machines: 5,
      rate_per_minute: 240,
    },
  },
  PRO: {
    name: 'Pro',
    limits: {
      cloud: true,
      max_users: 12,
      max_orders_month: null,
      storage_mb: 30720,
      max_photos_per_order: 15,
      max_machines: 12,
      rate_per_minute: 480,
    },
  },
  INTERNO: {
    name: 'Interno',
    limits: {
      cloud: true,
      max_users: 50,
      max_orders_month: null,
      storage_mb: 51200,
      max_photos_per_order: 20,
      max_machines: 20,
      rate_per_minute: 900,
    },
  },
};

/** Normaliza o nome do plano: PADRAO (licenças antigas) e desconhecidos viram VITALICIO. */
export function planId(plan: string | null | undefined): PlanId {
  const id = (plan ?? '').trim().toUpperCase();
  return id in PLANS ? (id as PlanId) : 'VITALICIO';
}

export const planName = (plan: string | null | undefined) =>
  PLANS[planId(plan)].name;

/** Limites assinados no token têm prioridade; sem eles, vale o catálogo. */
export function limitsFor(
  plan: string | null | undefined,
  signed?: Partial<PlanLimits> | null,
): PlanLimits {
  const base = PLANS[planId(plan)].limits;
  if (!signed || typeof signed !== 'object') return { ...base };
  return { ...base, ...signed };
}
