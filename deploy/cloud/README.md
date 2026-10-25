# Symnager Nuvem — deploy

API em modo `cloud` (multi-tenant) publicada em `https://symnager.plune.app.br/cloud/api`.

- Cada cliente (tenant) tem o próprio SQLite em `/data/tenants/<id>/symnager.db` e as fotos em
  `/data/tenants/<id>/photos/` (volume `symnager-cloud_cloud_data`). O banco é criado e migrado no primeiro acesso.
- Toda requisição traz `X-Symnager-License` (token assinado pelo servidor de licenças). O tenant e os limites
  do plano saem do token; planos sem nuvem (Vitalício) recebem `403 PLAN_NO_CLOUD`.
- O Nginx do `symnager-admin` faz o TLS e repassa `/cloud/*` para o alias `symnager-cloud` na rede `edge`
  (ver `nginx/default.conf.template` daquele repo). Quando o domínio próprio do Symnager chegar, basta uma
  linha nova no `map` da borda apontando para o mesmo `symnager-web`, ou um server próprio.

## Na VM

```bash
# código em /home/app/symnager-cloud (tarball do repo, sem .env nem bancos)
cd /home/app/symnager-cloud/deploy/cloud && ./deploy.sh
curl -s https://symnager.plune.app.br/cloud/api/health   # {"status":"ok",...,"mode":"cloud"}
docker compose logs -f cloud
```

## Backup

```bash
docker run --rm -v symnager-cloud_cloud_data:/data -v "$PWD":/out alpine \
  tar czf /out/symnager-cloud-$(date +%F).tgz -C /data tenants
```
