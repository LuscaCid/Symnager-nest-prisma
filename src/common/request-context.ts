import { AsyncLocalStorage } from 'async_hooks';

import type { PlanLimits } from '../plans/plans';

export type RequestContext = {
  ip: string | null;
  user_id: number | null;
  /** Só na nuvem: cliente (tenant) identificado pela licença da requisição. */
  tenant?: { id: number; name: string; plan: string; limits: PlanLimits };
};

// Contexto por requisição (IP e usuário) usado pela auditoria sem precisar
// passar esses dados por todas as camadas.
export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext =>
  requestContext.getStore() ?? { ip: null, user_id: null };
