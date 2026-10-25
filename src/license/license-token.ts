import { KeyObject, verify } from 'crypto';
import { PlanLimits } from '../plans/plans';

/** Conteúdo assinado pelo servidor de licenças. */
export type TokenPayload = {
  v: 1;
  lid: number;
  aid: number;
  machine_id: string;
  tenant: { id: number; name: string; document: string | null };
  plan: string;
  /** Desde a rodada dos planos web; tokens antigos não têm. */
  limits?: Partial<PlanLimits>;
  license_expires_at: string | null;
  iat: number;
  check_after: number;
  valid_until: number;
};

/** Confere a assinatura Ed25519 e devolve o payload, ou null. Não olha datas. */
export function decodeLicenseToken(
  token: string | null | undefined,
  publicKey: KeyObject,
): TokenPayload | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  try {
    const ok = verify(
      null,
      Buffer.from(body),
      publicKey,
      Buffer.from(signature, 'base64url'),
    );
    if (!ok) return null;
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as TokenPayload;
    return payload.v === 1 && payload.tenant?.id ? payload : null;
  } catch {
    return null;
  }
}
