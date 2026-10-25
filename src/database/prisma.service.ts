import {
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { loadConfig } from '../config/env';
import { getRequestContext } from '../common/request-context';
import { closeAllTenantDatabases, tenantClient } from './tenant-databases';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Na nuvem os serviços continuam injetando PrismaService, mas cada acesso
    // é redirecionado ao banco do cliente da requisição atual.
    if (loadConfig().appMode === 'cloud') return cloudProxy(this);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

const MODELS = new Set<string>(Object.values(Prisma.ModelName));

function cloudProxy(base: PrismaService): PrismaService {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'onModuleInit') return async () => undefined;
      if (prop === 'onModuleDestroy') return closeAllTenantDatabases;
      const dataAccess =
        typeof prop === 'string' && (MODELS.has(prop) || prop.startsWith('$'));
      // O Nest inspeciona a instância (constructor, ganchos): isso fica no objeto base.
      if (!dataAccess) return Reflect.get(target, prop, receiver);
      const tenant = getRequestContext().tenant;
      const client = tenant ? tenantClient(tenant.id) : null;
      if (!client)
        throw new InternalServerErrorException(
          'Banco do cliente indisponível nesta requisição.',
        );
      const value = Reflect.get(client, prop) as unknown;
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}
