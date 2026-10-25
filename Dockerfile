# syntax=docker/dockerfile:1

# ---- build: compila o Nest e gera o Prisma Client (engine linux-musl) ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build:prod && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl tini \
  && mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333 \
    DATABASE_URL=file:/data/symnager.db \
    APP_MODE=server \
    RUN_MIGRATIONS=true

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma

USER node
VOLUME ["/data"]
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

# tini repassa SIGTERM ao Node para o shutdown limpo do Prisma.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
