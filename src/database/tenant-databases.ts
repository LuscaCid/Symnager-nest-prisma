import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config/env';
import { runMigrations } from './migrator';

// Nuvem: um SQLite por cliente em <DATA_DIR>/tenants/<id>/symnager.db.
// Isola os dados de cada assistência sem filtro por tenant espalhado pelas consultas.

type Entry = { client: PrismaClient; lastUse: number };

const MAX_OPEN = 64;
const logger = new Logger('Tenants');
const open = new Map<number, Entry>();
const opening = new Map<number, Promise<PrismaClient>>();

export const tenantDir = (tenantId: number) =>
  path.join(loadConfig().dataDir, 'tenants', String(tenantId));

export const tenantDatabaseFile = (tenantId: number) =>
  path.join(tenantDir(tenantId), 'symnager.db');

const urlFor = (tenantId: number) =>
  `file:${tenantDatabaseFile(tenantId).replace(/\\/g, '/')}`;

/** Abre (criando e migrando na primeira vez) o banco do cliente. */
export async function ensureTenantDatabase(
  tenantId: number,
): Promise<PrismaClient> {
  if (!Number.isInteger(tenantId) || tenantId <= 0)
    throw new Error('tenant inválido');
  const entry = open.get(tenantId);
  if (entry) {
    entry.lastUse = Date.now();
    return entry.client;
  }
  let pending = opening.get(tenantId);
  if (!pending) {
    pending = (async () => {
      fs.mkdirSync(tenantDir(tenantId), { recursive: true });
      const applied = await runMigrations(
        urlFor(tenantId),
        loadConfig().migrationsDir,
      );
      if (applied.length)
        logger.log(`tenant ${tenantId}: ${applied.length} migração(ões)`);
      const client = new PrismaClient({
        datasources: { db: { url: urlFor(tenantId) } },
      });
      await client.$connect();
      open.set(tenantId, { client, lastUse: Date.now() });
      evictIdle();
      return client;
    })().finally(() => opening.delete(tenantId));
    opening.set(tenantId, pending);
  }
  return pending;
}

/** Cliente já aberto (o guard da nuvem garante a abertura antes do handler). */
export function tenantClient(tenantId: number): PrismaClient | null {
  const entry = open.get(tenantId);
  if (!entry) return null;
  entry.lastUse = Date.now();
  return entry.client;
}

/** Fecha o banco do cliente (antes de trocar o arquivo, por exemplo). */
export async function closeTenantDatabase(tenantId: number) {
  const entry = open.get(tenantId);
  open.delete(tenantId);
  await entry?.client.$disconnect().catch(() => undefined);
}

function evictIdle() {
  if (open.size <= MAX_OPEN) return;
  const oldest = [...open.entries()].sort(
    (a, b) => a[1].lastUse - b[1].lastUse,
  );
  for (const [id, entry] of oldest.slice(0, open.size - MAX_OPEN)) {
    // Só fecha quem está parado há mais de 1 min: requisições em curso seguem com o cliente.
    if (Date.now() - entry.lastUse < 60_000) continue;
    open.delete(id);
    void entry.client.$disconnect().catch(() => undefined);
  }
}

export async function closeAllTenantDatabases() {
  const entries = [...open.values()];
  open.clear();
  await Promise.all(
    entries.map((e) => e.client.$disconnect().catch(() => undefined)),
  );
}
