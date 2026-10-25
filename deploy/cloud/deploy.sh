#!/usr/bin/env bash
#
# Deploy da Symnager Nuvem na VM. Rode a partir desta pasta (deploy/cloud).
# Gera JWT_SECRET na primeira vez, reconstrói, espera a saúde e limpa só o lixo
# deste build (a VM hospeda outros produtos: nada de prune -a).
set -euo pipefail
cd "$(dirname "$0")"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"
log() { printf '\n\033[1;32m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mFALHOU: %s\033[0m\n' "$1" >&2; exit 1; }

docker network inspect edge >/dev/null 2>&1 || fail "rede edge não existe (a borda plune-workspace/edge precisa estar no ar)"

if [ ! -f .env ]; then
  log "Criando .env"
  umask 077
  printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')" > .env
fi
grep -qE '^JWT_SECRET=.{32,}' .env || fail "JWT_SECRET ausente ou curto no .env"

log "Reconstruindo e reiniciando"
docker compose up -d --build --remove-orphans

log "Esperando a API"
DEADLINE=$(( $(date +%s) + HEALTH_TIMEOUT ))
until docker compose exec -T cloud wget -qO- http://127.0.0.1:3333/api/health 2>/dev/null | grep -q '"status":"ok"'; do
  [ "$(date +%s)" -lt "$DEADLINE" ] || fail "não ficou saudável em ${HEALTH_TIMEOUT}s; veja: docker compose logs cloud"
  sleep 3
done
echo "    api saudável"

log "Limpeza"
docker image prune -f | sed 's/^/    /'
docker builder prune -f --filter "until=168h" | sed 's/^/    /'

log "Deploy concluído: https://symnager.plune.app.br/cloud/api/health"
