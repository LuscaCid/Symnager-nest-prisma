export const ROLES = ['ADMIN', 'TECNICO', 'ATENDENTE'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  'ABERTA',
  'EM_ANALISE',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'AGUARDANDO_PECA',
  'EM_REPARO',
  'PRONTA',
  'ENTREGUE',
  'CANCELADA',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const FINAL_STATUSES: readonly OrderStatus[] = ['ENTREGUE', 'CANCELADA'];
export const OPEN_STATUSES = ORDER_STATUSES.filter(
  (s) => !FINAL_STATUSES.includes(s),
);

export const PRIORITIES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ITEM_KINDS = ['SERVICE', 'PRODUCT'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const HISTORY_TYPES = [
  'CREATED',
  'STATUS',
  'COMMENT',
  'ITEM',
  'PAYMENT',
  'FAILURE',
  'UPDATE',
  'PRINT',
] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

export const FAILURE_CATEGORIES = [
  'ENTREGA',
  'GARANTIA',
  'RETRABALHO',
  'PECA',
  'ATRASO',
  'OUTRO',
] as const;

export const LOOKUP_KINDS = [
  'DEVICE_TYPE',
  'BRAND',
  'PAYMENT_METHOD',
  'FAILURE_REASON',
  'ACCESSORY',
  'CHECKLIST',
] as const;

export const CLIENT_TYPES = ['PF', 'PJ'] as const;
export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUST'] as const;
