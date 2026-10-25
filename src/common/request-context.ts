import { AsyncLocalStorage } from 'async_hooks';

export type RequestContext = { ip: string | null; user_id: number | null };

// Contexto por requisição (IP e usuário) usado pela auditoria sem precisar
// passar esses dados por todas as camadas.
export const requestContext = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext =>
  requestContext.getStore() ?? { ip: null, user_id: null };
