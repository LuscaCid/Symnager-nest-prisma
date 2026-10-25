import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createPublicKey, KeyObject } from 'crypto';
import { Request } from 'express';
import { loadConfig } from '../config/env';
import { getRequestContext } from '../common/request-context';
import { ensureTenantDatabase } from '../database/tenant-databases';
import { decodeLicenseToken } from '../license/license-token';
import { limitsFor, planName } from '../plans/plans';

export const LICENSE_HEADER = 'x-symnager-license';

// O app faz check-in a cada 6 h; na nuvem só vale token recente, para que
// bloqueios e trocas de plano no painel cheguem rápido.
const MAX_TOKEN_AGE_S = 24 * 3600;
const CLOCK_SKEW_S = 10 * 60;

const forbidden = (code: string, message: string) =>
  new HttpException(
    { statusCode: HttpStatus.FORBIDDEN, code, message },
    HttpStatus.FORBIDDEN,
  );

/**
 * Porta de entrada da nuvem: cada requisição traz o token assinado pelo servidor de
 * licenças. Dele saem o cliente (tenant) e os limites do plano; nada vem do corpo
 * ou da URL, então um cliente não consegue escolher o banco de outro.
 */
@Injectable()
export class CloudAccess {
  private readonly publicKey: KeyObject = createPublicKey(
    loadConfig().licensePublicKey,
  );
  private readonly windows = new Map<
    number,
    { start: number; count: number }
  >();

  async authorize(request: Request) {
    const header = request.headers[LICENSE_HEADER];
    const token = typeof header === 'string' ? header.trim() : '';
    const payload = decodeLicenseToken(token, this.publicKey);
    if (!payload)
      throw forbidden(
        'CLOUD_LICENSE_INVALID',
        'Licença não reconhecida pelo servidor em nuvem. Ative o Symnager com a sua chave.',
      );

    const now = Math.floor(Date.now() / 1000);
    const expired =
      now > payload.valid_until ||
      (payload.license_expires_at &&
        Date.parse(payload.license_expires_at) < Date.now());
    if (expired || payload.iat > now + CLOCK_SKEW_S)
      throw forbidden(
        'CLOUD_LICENSE_INVALID',
        'A licença deste computador expirou. Abra Configurações > Licença e clique em "Verificar agora".',
      );
    if (now - payload.iat > MAX_TOKEN_AGE_S)
      throw forbidden(
        'CLOUD_LICENSE_STALE',
        'A licença precisa ser validada de novo. Clique em "Verificar agora" em Configurações > Licença.',
      );

    const limits = limitsFor(payload.plan, payload.limits);
    if (!limits.cloud)
      throw forbidden(
        'PLAN_NO_CLOUD',
        `Seu plano (${planName(payload.plan)}) usa apenas o banco local. Para conectar ao servidor em nuvem, contrate um plano mensal.`,
      );

    this.rateLimit(payload.tenant.id, limits.rate_per_minute);
    await ensureTenantDatabase(payload.tenant.id);
    getRequestContext().tenant = {
      id: payload.tenant.id,
      name: payload.tenant.name,
      plan: payload.plan,
      limits,
    };
  }

  /** Janela fixa de 1 min por cliente, além do limite por IP do Throttler. */
  private rateLimit(tenantId: number, perMinute: number | null) {
    if (!perMinute) return;
    const now = Date.now();
    const w = this.windows.get(tenantId);
    if (!w || now - w.start >= 60_000) {
      this.windows.set(tenantId, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.windows.clear();
      return;
    }
    if (++w.count > perMinute)
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'PLAN_RATE_LIMIT',
          message: `O seu plano permite ${perMinute} requisições por minuto. Aguarde alguns segundos.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
