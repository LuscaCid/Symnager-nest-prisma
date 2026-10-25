import * as fs from 'fs';
import * as path from 'path';
import {
  LICENSE_PUBLIC_KEY,
  LICENSE_SERVER_URL,
} from '../license/license.keys';

// Raiz do projeto (pasta que contém package.json, prisma/ e dist/).
// Funciona tanto em src/ (ts-node) quanto em dist/ (build).
export const APP_ROOT = path.resolve(__dirname, '..', '..');

export type AppConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  databaseFile: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtExpiresInSeconds: number;
  refreshTtlDays: number;
  corsOrigins: string[];
  trustProxy: boolean;
  appMode: 'local' | 'server';
  runMigrations: boolean;
  migrationsDir: string;
  cookieSecure: boolean;
  internalToken: string | null;
  isProduction: boolean;
  version: string;
  licenseServerUrl: string;
  licensePublicKey: string;
};

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** Converte "15m", "1h", "900" ou "900s" em segundos. */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(value.trim());
  if (!match)
    throw new Error(`Duração inválida: "${value}" (use 900, 15m, 1h, 1d)`);
  const n = Number(match[1]);
  const unit = match[2] ?? 's';
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

/**
 * Resolve o caminho absoluto do arquivo SQLite a partir de DATABASE_URL.
 * Caminhos relativos seguem a regra do Prisma: relativos à pasta prisma/.
 */
export function resolveDatabaseFile(url: string): string {
  if (!url.startsWith('file:')) {
    throw new Error(
      'DATABASE_URL deve ser um caminho SQLite no formato file:...',
    );
  }
  let file = url.slice('file:'.length).split('?')[0];
  if (file.startsWith('//')) file = file.slice(2);
  return path.isAbsolute(file)
    ? path.normalize(file)
    : path.resolve(APP_ROOT, 'prisma', file);
}

function readVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8'),
    );
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

let cached: AppConfig | null = null;

/** Lê e valida as variáveis de ambiente. Lança erro com todas as falhas encontradas. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const errors: string[] = [];

  const port = Number(env.PORT ?? 3333);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    errors.push('PORT inválida.');

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    errors.push(
      'JWT_SECRET é obrigatório e deve ter pelo menos 32 caracteres.',
    );
  }

  const jwtExpiresIn = env.JWT_EXPIRES_IN || '15m';
  let jwtExpiresInSeconds = 900;
  try {
    jwtExpiresInSeconds = durationToSeconds(jwtExpiresIn);
  } catch (e) {
    errors.push((e as Error).message);
  }

  const refreshTtlDays = Number(env.REFRESH_TTL_DAYS ?? 30);
  if (!(refreshTtlDays > 0)) errors.push('REFRESH_TTL_DAYS inválido.');

  const appMode = (env.APP_MODE || 'server') as AppConfig['appMode'];
  if (!['local', 'server'].includes(appMode))
    errors.push('APP_MODE deve ser "local" ou "server".');

  const databaseUrl = env.DATABASE_URL || 'file:./dev.db';
  let databaseFile = '';
  try {
    databaseFile = resolveDatabaseFile(databaseUrl);
  } catch (e) {
    errors.push((e as Error).message);
  }

  const internalToken = env.INTERNAL_TOKEN || null;
  if (internalToken && internalToken.length < 32) {
    errors.push(
      'INTERNAL_TOKEN, quando definido, deve ter pelo menos 32 caracteres.',
    );
  }

  if (errors.length) {
    throw new Error(`Configuração inválida:\n - ${errors.join('\n - ')}`);
  }

  cached = {
    port,
    host: env.HOST || '127.0.0.1',
    databaseUrl,
    databaseFile,
    jwtSecret,
    jwtExpiresIn,
    jwtExpiresInSeconds,
    refreshTtlDays,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,app://symnager')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    trustProxy: bool(env.TRUST_PROXY, false),
    appMode,
    runMigrations: bool(env.RUN_MIGRATIONS, true),
    migrationsDir:
      env.MIGRATIONS_DIR || path.join(APP_ROOT, 'prisma', 'migrations'),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    internalToken,
    isProduction: env.NODE_ENV === 'production',
    version: readVersion(),
    // Sobrescritos só em desenvolvimento/testes (servidor de licenças local).
    licenseServerUrl: (env.LICENSE_SERVER_URL || LICENSE_SERVER_URL).replace(
      /\/+$/,
      '',
    ),
    licensePublicKey: (env.LICENSE_PUBLIC_KEY || LICENSE_PUBLIC_KEY).replace(
      /\\n/g,
      '\n',
    ),
  };
  return cached;
}
