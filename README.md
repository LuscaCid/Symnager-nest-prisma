# Symnager API

API do Symnager (gestão de ordens de serviço para assistência técnica): NestJS 10 + Prisma 5 + SQLite.
Desenvolvido por **Lucidev**.
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

## Licença

Sem licença válida todas as rotas respondem **402** `{ code: "LICENSE_REQUIRED", license_status }`,
exceto `GET /api/health`, `/api/license/*` e `GET /api/backup/database` (os dados são do cliente).

- `GET /api/license` — status (também em `GET /api/settings` → `license`)
- `POST /api/license/activate { key }` — valida online em `symnager.plune.app.br` e guarda o token assinado
- `POST /api/license/refresh` — check-in imediato · `POST /api/license/request` — pedido de licença
- `DELETE /api/license` (ADMIN) — libera a vaga deste computador

O token (Ed25519, chave pública em `src/license/license.keys.ts`) fica em `license.json`, ao lado do banco:
sobrevive a restore e não viaja nos backups. É amarrado ao ID da máquina, renovado a cada 6 h e
aceito offline por até 7 dias. O servidor e o painel estão no repositório `symnager-admin`.

## Planos e nuvem

| Plano | Preço | Nuvem | Usuários | OS/mês | Espaço | Fotos/OS | Computadores |
|---|---|---|---|---|---|---|---|
| Vitalício | R$ 74,90 único | não (só banco local) | ilimitado | ilimitado | disco do PC | 10 | 1 |
| Básico | R$ 18,90/mês | sim | 2 | 80 | 2 GB | 4 | 2 |
| Intermediário | R$ 34,90/mês | sim | 5 | 300 | 10 GB | 8 | 5 |
| Pro | R$ 49,90/mês | sim | 12 | ilimitado | 30 GB | 15 | 12 |

Catálogo em `src/plans/plans.ts` (o mesmo do servidor de licenças, que assina os limites no token).

- `APP_MODE=cloud`: multi-tenant. O guard de licença lê `X-Symnager-License`, confere a assinatura, recusa
  planos sem nuvem (`403 PLAN_NO_CLOUD`) e tokens com mais de 24 h (`CLOUD_LICENSE_STALE`), e abre o banco do
  cliente em `DATA_DIR/tenants/<id>/symnager.db` (migrado no primeiro acesso). O `PrismaService` vira um proxy
  para o banco do tenant da requisição; o JWT carrega `tid` e só vale para o mesmo tenant.
- Limites (`403 PLAN_LIMIT`): usuários ativos, OS no mês, espaço (banco + fotos) e fotos por OS; requisições por
  minuto por cliente (`429 PLAN_RATE_LIMIT`).
- Fotos da OS: `GET/POST /api/orders/:id/photos`, `GET .../:photoId/file`, `DELETE .../:photoId` (JPEG/PNG/WebP até 5 MB,
  tipo conferido pelo conteúdo).
- Sincronização: `GET /api/sync/export` (nuvem, ADMIN) gera um tar com o banco e as fotos; `POST /api/sync/import`
  (desktop, só `x-internal-token`) troca o banco local e as fotos, com cópia de segurança e rollback.
- Deploy da nuvem: [deploy/cloud/README.md](deploy/cloud/README.md).

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
