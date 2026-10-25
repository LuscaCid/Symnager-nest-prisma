import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_ROOT, loadConfig } from './config/env';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Em desenvolvimento lê o .env; Electron e Docker passam as variáveis pelo processo.
  const envFile = path.join(APP_ROOT, '.env');
  if (fs.existsSync(envFile))
    (await import('dotenv')).config({ path: envFile });

  const config = loadConfig();
  // Caminho absoluto para o Prisma, o migrador e o backup usarem o mesmo arquivo.
  process.env.DATABASE_URL = `file:${config.databaseFile.replace(/\\/g, '/')}`;
  fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true });

  if (config.runMigrations) {
    const { runMigrations } = await import('./database/migrator');
    const applied = await runMigrations(
      process.env.DATABASE_URL,
      config.migrationsDir,
    );
    logger.log(
      applied.length
        ? `${applied.length} migração(ões) aplicada(s).`
        : 'Banco de dados atualizado.',
    );
  }

  // Importado depois do ajuste de DATABASE_URL.
  const { AppModule } = await import('./app.module');
  const { createValidationPipe } = await import('./common/validation');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: config.isProduction ? ['log', 'warn', 'error'] : undefined,
  });

  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });
  app.use(cookieParser());
  app.enableCors({
    origin: (origin, callback) => {
      // Sem Origin = mesmo processo/CLI (Electron main, curl, healthcheck).
      if (!origin || config.corsOrigins.includes(origin))
        return callback(null, true);
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Internal-Token',
    ],
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  // O Electron aguarda esta linha (ou GET /api/health) para saber que a API está pronta.
  logger.log(
    `Symnager API ${config.version} (${config.appMode}) listening on http://${config.host}:${config.port}/api`,
  );
  const ready = { type: 'ready', port: config.port };
  // utilityProcess do Electron expõe parentPort; child_process.fork expõe process.send.
  (
    process as unknown as { parentPort?: { postMessage(m: unknown): void } }
  ).parentPort?.postMessage(ready);
  process.send?.(ready);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
