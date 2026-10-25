import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Aplica prisma/migrations/*/migration.sql sem depender do CLI do Prisma
// (o app empacotado no Electron não tem o CLI). Grava em _prisma_migrations
// no mesmo formato do `prisma migrate deploy`, então os dois são intercambiáveis.

const logger = new Logger('Migrator');

const CREATE_MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

type AppliedRow = {
  migration_name: string;
  checksum: string;
  finished_at: string | null;
  rolled_back_at: string | null;
};

/** Divide o script em comandos. Suficiente para o SQL gerado pelo Prisma (sem triggers). */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function listMigrations(dir: string) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Pasta de migrações não encontrada: ${dir}`);
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        fs.existsSync(path.join(dir, d.name, 'migration.sql')),
    )
    .map((d) => d.name)
    .sort()
    .map((name) => {
      // Normaliza CRLF (checkout no Windows) para o checksum bater com o do Prisma.
      const sql = fs
        .readFileSync(path.join(dir, name, 'migration.sql'), 'utf8')
        .replace(/\r\n/g, '\n');
      return {
        name,
        sql,
        checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
      };
    });
}

/**
 * Aplica as migrações pendentes. Usa um PrismaClient próprio com
 * connection_limit=1 para que os PRAGMAs valham para todos os comandos.
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsDir: string,
): Promise<string[]> {
  const url = databaseUrl.includes('?')
    ? `${databaseUrl}&connection_limit=1`
    : `${databaseUrl}?connection_limit=1`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const applied: string[] = [];
  try {
    await prisma.$executeRawUnsafe(CREATE_MIGRATIONS_TABLE);
    const rows = await prisma.$queryRawUnsafe<AppliedRow[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"',
    );

    // Cada migração roda em transação: se o processo morreu no meio, nada foi
    // gravado e basta marcar a tentativa como revertida para tentar de novo.
    if (rows.some((r) => !r.finished_at && !r.rolled_back_at)) {
      await prisma.$executeRawUnsafe(
        'UPDATE "_prisma_migrations" SET rolled_back_at = ? WHERE finished_at IS NULL AND rolled_back_at IS NULL',
        new Date().toISOString(),
      );
    }
    const done = new Map(
      rows
        .filter((r) => r.finished_at && !r.rolled_back_at)
        .map((r) => [r.migration_name, r]),
    );

    for (const migration of listMigrations(migrationsDir)) {
      const existing = done.get(migration.name);
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          logger.warn(
            `Checksum diferente para a migração já aplicada "${migration.name}".`,
          );
        }
        continue;
      }

      const id = randomUUID();
      const startedAt = new Date().toISOString();
      await prisma.$executeRawUnsafe(
        'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)',
        id,
        migration.checksum,
        migration.name,
        startedAt,
      );

      // PRAGMAs não têm efeito dentro de transação, então rodam fora dela.
      const statements = splitStatements(migration.sql);
      const body = statements.filter((s) => !/^PRAGMA\s/i.test(s));
      const disablesFks = statements.some((s) =>
        /^PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(s),
      );
      try {
        if (disablesFks)
          await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF');
        await prisma.$executeRawUnsafe('BEGIN');
        try {
          for (const statement of body)
            await prisma.$executeRawUnsafe(statement);
          const violations = await prisma.$queryRawUnsafe<unknown[]>(
            'PRAGMA foreign_key_check',
          );
          if (violations.length) {
            throw new Error(
              `Violação de chave estrangeira após a migração (${violations.length}).`,
            );
          }
          await prisma.$executeRawUnsafe('COMMIT');
        } catch (e) {
          await prisma.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
          throw e;
        }
      } catch (e) {
        await prisma.$executeRawUnsafe(
          'UPDATE "_prisma_migrations" SET logs = ?, rolled_back_at = ? WHERE id = ?',
          String((e as Error).message ?? e),
          new Date().toISOString(),
          id,
        );
        throw new Error(
          `Falha ao aplicar a migração "${migration.name}": ${(e as Error).message}`,
        );
      } finally {
        await prisma
          .$executeRawUnsafe('PRAGMA foreign_keys=ON')
          .catch(() => undefined);
      }

      await prisma.$executeRawUnsafe(
        'UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?',
        new Date().toISOString(),
        id,
      );
      applied.push(migration.name);
      logger.log(`Migração aplicada: ${migration.name}`);
    }
    return applied;
  } finally {
    await prisma.$disconnect();
  }
}
