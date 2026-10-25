# Symnager API

API do Symnager (gestão de ordens de serviço para assistência técnica): NestJS 10 + Prisma 5 + SQLite.
O contrato das rotas fica no repositório do frontend: `Symnager-tanstack-hookform/docs/API_CONTRACT.md`.

## Desenvolvimento

```bash
cp .env.example .env        # defina JWT_SECRET (>= 32 caracteres)
npm install
npm run start:dev           # http://127.0.0.1:3333/api — migrações aplicadas no boot
```

Na primeira execução `GET /api/auth/status` retorna `needs_setup: true`; `POST /api/auth/setup` cria o administrador
e os cadastros auxiliares padrão.

| Script | Uso |
|---|---|
| `npm run build` | compila para `dist/` (entry: `dist/main.js`) |
| `npm run build:prod` | `prisma generate` + build (CI/Docker). No Windows, pare a API antes: a engine do Prisma fica travada enquanto ela roda |
| `npm run prisma:migrate` | cria uma migração nova a partir do `schema.prisma` (`prisma migrate dev`) |
| `npm run lint` / `npm run typecheck` | qualidade |

### Migrações

`prisma/migrations/*/migration.sql` são aplicadas no boot por `src/database/migrator.ts` (com `RUN_MIGRATIONS=true`),
sem depender do CLI do Prisma. O registro em `_prisma_migrations` é compatível com `prisma migrate deploy`.
Cada migração roda numa transação. Os arquivos `.sql` são mantidos com LF (`.gitattributes`) para o checksum bater.

## Variáveis de ambiente

Veja `.env.example`. Obrigatória: `JWT_SECRET`. Opcional: `INTERNAL_TOKEN` (≥ 32 caracteres), que libera apenas
`GET /api/backup/database` pelo header `x-internal-token` (backup automático do desktop).

## Desktop (Electron)

O app desktop executa `dist/main.js` via `utilityProcess` com `APP_MODE=local` e `DATABASE_URL` absoluto.
Arquivos necessários no pacote: `dist/`, `prisma/migrations/`, `package.json` e `node_modules` de produção
(incluindo `node_modules/.prisma/client`, gerado no build). As pastas `node_modules/.prisma` e `node_modules/@prisma`
precisam ficar fora do asar (a engine do Prisma é uma biblioteca nativa Node-API).
Ao ficar pronta, a API envia `{ type: 'ready', port }` por `process.parentPort` / `process.send`.

## Docker

```bash
docker build -t symnager-api .
docker run -p 3333:3333 -v symnager-data:/data -e JWT_SECRET=... symnager-api
```

Imagem `node:22-alpine` multi-stage, usuário não-root, SQLite em `/data/symnager.db` e `HEALTHCHECK` em `/api/health`.
