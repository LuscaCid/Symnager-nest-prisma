import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { createPublicKey, KeyObject, verify } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { getMachineId } from './machine-id';

/** Conteúdo assinado pelo servidor de licenças. */
type TokenPayload = {
  v: 1;
  lid: number;
  aid: number;
  machine_id: string;
  tenant: { id: number; name: string; document: string | null };
  plan: string;
  license_expires_at: string | null;
  iat: number;
  check_after: number;
  valid_until: number;
};

/** Gravado em <pasta do banco>/license.json (fora do banco: sobrevive a restore). */
type LicenseFile = {
  key: string | null;
  token: string | null;
  refusal: { code: string; message: string } | null;
  last_check_at: string | null;
  last_error: string | null;
  /** Maior horário já visto; detecta relógio atrasado de propósito. */
  last_seen: number;
  activated_at: string | null;
};

export type LicenseStatus =
  | 'ACTIVE' // token válido e último check-in ok
  | 'OFFLINE' // token válido, mas o servidor não respondeu no último check-in
  | 'UNLICENSED' // nenhuma chave informada
  | 'EXPIRED' // passou do prazo offline sem conseguir falar com o servidor
  | 'CLOCK_TAMPERED' // relógio do computador voltou no tempo
  | string; // código de recusa do servidor (TENANT_BLOCKED, LICENSE_BLOCKED...)

const EMPTY: LicenseFile = {
  key: null,
  token: null,
  refusal: null,
  last_check_at: null,
  last_error: null,
  last_seen: 0,
  activated_at: null,
};

const MESSAGES: Record<string, string> = {
  UNLICENSED: 'Informe a chave de licença para liberar o Symnager.',
  EXPIRED:
    'Não foi possível validar a licença há vários dias. Conecte o computador à internet.',
  CLOCK_TAMPERED:
    'A data do computador está incorreta. Ajuste o relógio e conecte-se à internet.',
  INVALID_TOKEN:
    'Licença inválida para este computador. Informe a chave novamente.',
};

// Folga para relógios de PCs levemente errados; voltar dias no relógio ainda é detectado.
const CLOCK_TOLERANCE_S = 24 * 3600;
const RETRY_MS = 15 * 60 * 1000;
const TIMER_MS = 5 * 60 * 1000;

class NetworkError extends Error {}

@Injectable()
export class LicenseService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('License');
  private readonly file: string;
  private readonly dataDir: string;
  private readonly publicKey: KeyObject;
  private state: LicenseFile;
  private machineId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private nextAttemptAt = 0;
  private inflight: Promise<unknown> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {
    const config = loadConfig();
    this.dataDir = path.dirname(config.databaseFile);
    this.file = path.join(this.dataDir, 'license.json');
    this.publicKey = createPublicKey(config.licensePublicKey);
    this.state = this.read();
  }

  onApplicationBootstrap() {
    // Não segura o boot: sem internet a API sobe e usa o token guardado.
    void this.refreshIfDue(true);
    this.timer = setInterval(() => void this.refreshIfDue(), TIMER_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private getMachineId() {
    return (this.machineId ??= getMachineId(this.dataDir));
  }

  // ---------- persistência ----------

  private read(): LicenseFile {
    try {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      return { ...EMPTY };
    }
  }

  private save(patch: Partial<LicenseFile>) {
    this.state = { ...this.state, ...patch };
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  // ---------- token ----------

  private decode(token: string | null): TokenPayload | null {
    if (!token) return null;
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;
    try {
      const ok = verify(
        null,
        Buffer.from(body),
        this.publicKey,
        Buffer.from(signature, 'base64url'),
      );
      if (!ok) return null;
      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as TokenPayload;
      return payload.v === 1 ? payload : null;
    } catch {
      return null;
    }
  }

  /** Avaliação local, sem rede. É o que o guard consulta a cada requisição. */
  evaluate(): {
    valid: boolean;
    status: LicenseStatus;
    message: string | null;
    payload: TokenPayload | null;
  } {
    const now = Math.floor(Date.now() / 1000);
    const s = this.state;
    if (!s.key)
      return {
        valid: false,
        status: 'UNLICENSED',
        message: MESSAGES.UNLICENSED,
        payload: null,
      };
    if (s.refusal && !s.token)
      return {
        valid: false,
        status: s.refusal.code,
        message: s.refusal.message,
        payload: null,
      };
    const payload = this.decode(s.token);
    if (!payload || payload.machine_id !== this.getMachineId())
      return {
        valid: false,
        status: 'INVALID_TOKEN',
        message: MESSAGES.INVALID_TOKEN,
        payload: null,
      };
    if (now + CLOCK_TOLERANCE_S < Math.max(s.last_seen, payload.iat))
      return {
        valid: false,
        status: 'CLOCK_TAMPERED',
        message: MESSAGES.CLOCK_TAMPERED,
        payload,
      };
    if (now > payload.valid_until)
      return {
        valid: false,
        status: 'EXPIRED',
        message: MESSAGES.EXPIRED,
        payload,
      };

    // Guarda o maior horário visto (no máximo a cada 5 min, para não gravar sempre).
    if (now - s.last_seen > 300) {
      try {
        this.save({ last_seen: now });
      } catch {
        // disco somente leitura: segue sem a proteção de relógio
      }
    }
    return {
      valid: true,
      status: s.last_error ? 'OFFLINE' : 'ACTIVE',
      message: s.last_error
        ? 'Sem conexão com o servidor de licenças. O Symnager segue liberado até a data indicada.'
        : null,
      payload,
    };
  }

  /** Resumo exibido em Configurações e na tela de ativação. */
  status() {
    const { valid, status, message, payload } = this.evaluate();
    const key = this.state.key;
    return {
      valid,
      status,
      message,
      key_masked: key ? `${key.slice(0, 5)}•••••-${key.slice(-5)}` : null,
      tenant: payload?.tenant ?? null,
      plan: payload?.plan ?? null,
      license_expires_at: payload?.license_expires_at ?? null,
      offline_until: payload
        ? new Date(payload.valid_until * 1000).toISOString()
        : null,
      activated_at: this.state.activated_at,
      last_check_at: this.state.last_check_at,
      machine_name: os.hostname(),
      machine_id: this.getMachineId().slice(0, 12),
      server_url: loadConfig().licenseServerUrl,
    };
  }

  // ---------- servidor ----------

  private async report() {
    const [settings, users] = await Promise.all([
      this.settings.getAll(),
      this.prisma.users.findMany({
        select: {
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
        },
        orderBy: { user_id: 'asc' },
        take: 500,
      }),
    ]);
    return { company_name: settings.company.name || undefined, users };
  }

  private async call(
    route: string,
    body: Record<string, unknown>,
    // Pedidos de licença: erros 4xx sem código (validação, rate limit) voltam ao usuário.
    clientErrors = false,
  ) {
    let res: Response;
    try {
      res = await fetch(`${loadConfig().licenseServerUrl}/api/v1/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new NetworkError((error as Error).message);
    }
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      code?: string;
      message?: string | string[];
    };
    if (res.ok) return data;
    // 5xx, 429 e respostas sem código são falhas transitórias, não recusas.
    const clientError = clientErrors && res.status >= 400 && res.status < 500;
    if (!data.code && !clientError)
      throw new NetworkError(`HTTP ${res.status}`);
    const message = Array.isArray(data.message)
      ? data.message.join(' ')
      : data.message ?? 'Licença recusada.';
    return {
      refusal: { code: data.code ?? 'REQUEST_REJECTED', message },
      status: res.status,
    };
  }

  private async checkIn(mode: 'activate' | 'check', key: string) {
    const body = {
      key,
      machine_id: this.getMachineId(),
      machine_name: os.hostname().slice(0, 120),
      app_version: loadConfig().version,
      report: await this.report(),
    };
    return this.call(`licenses/${mode}`, body) as Promise<{
      token?: string;
      refusal?: { code: string; message: string };
      status?: number;
    }>;
  }

  private accept(token: string, key: string) {
    const payload = this.decode(token);
    if (!payload || payload.machine_id !== this.getMachineId())
      throw new HttpException(
        {
          statusCode: 502,
          message: 'Resposta inválida do servidor de licenças.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    this.save({
      key,
      token,
      refusal: null,
      last_error: null,
      last_check_at: new Date().toISOString(),
      last_seen: Math.max(this.state.last_seen, payload.iat),
      activated_at:
        this.state.key === key
          ? this.state.activated_at ?? new Date().toISOString()
          : new Date().toISOString(),
    });
  }

  /** Tela de ativação: valida a chave online e grava o token. */
  async activate(rawKey: string) {
    const key = rawKey.trim().toUpperCase().replace(/\s+/g, '');
    let result: Awaited<ReturnType<LicenseService['checkIn']>>;
    try {
      result = await this.checkIn('activate', key);
    } catch (error) {
      if (error instanceof NetworkError)
        throw new HttpException(
          {
            statusCode: 503,
            code: 'LICENSE_SERVER_UNREACHABLE',
            message:
              'Não foi possível falar com o servidor de licenças. Verifique a internet e tente novamente.',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      throw error;
    }
    if (result.refusal)
      throw new HttpException(
        { statusCode: result.status, ...result.refusal },
        result.status ?? HttpStatus.FORBIDDEN,
      );
    this.accept(result.token, key);
    await this.audit.log({ action: 'LICENSE_ACTIVATE', entity: 'license' });
    return this.status();
  }

  /** Check-in periódico. force: ignora check_after (boot e botão "verificar agora"). */
  async refreshIfDue(force = false) {
    if (this.inflight) return this.inflight;
    const key = this.state.key;
    if (!key) return;
    const now = Date.now();
    const payload = this.decode(this.state.token);
    const due =
      force ||
      !payload ||
      now >= payload.check_after * 1000 ||
      !!this.state.last_error;
    if (!due || (!force && now < this.nextAttemptAt)) return;

    this.inflight = this.doRefresh(key).finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async doRefresh(key: string) {
    try {
      let result = await this.checkIn('check', key);
      // Vaga liberada (ex.: desativado no painel): tenta ocupar de novo.
      if (result.refusal?.code === 'ACTIVATION_NOT_FOUND')
        result = await this.checkIn('activate', key);
      if (result.refusal) {
        this.logger.warn(`Licença recusada: ${result.refusal.code}`);
        this.save({
          token: null,
          refusal: result.refusal,
          last_error: null,
          last_check_at: new Date().toISOString(),
        });
      } else {
        this.accept(result.token, key);
      }
      this.nextAttemptAt = Date.now() + RETRY_MS;
    } catch (error) {
      this.nextAttemptAt = Date.now() + RETRY_MS;
      if (error instanceof NetworkError) {
        this.logger.warn(`Servidor de licenças indisponível: ${error.message}`);
        this.save({ last_error: error.message });
        return;
      }
      this.logger.error(error instanceof Error ? error.stack : String(error));
    }
  }

  /** Pedido de licença (tela "ainda não tenho licença"), repassado ao servidor. */
  async request(body: Record<string, unknown>) {
    let result: Awaited<ReturnType<LicenseService['call']>>;
    try {
      result = await this.call(
        'requests',
        {
          ...body,
          machine_name: os.hostname().slice(0, 120),
        },
        true,
      );
    } catch {
      throw new HttpException(
        {
          statusCode: 503,
          code: 'LICENSE_SERVER_UNREACHABLE',
          message:
            'Não foi possível falar com o servidor de licenças. Verifique a internet e tente novamente.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if ('refusal' in result && result.refusal)
      throw new HttpException(
        { statusCode: result.status, ...result.refusal },
        result.status ?? HttpStatus.BAD_REQUEST,
      );
    return result;
  }

  /** Libera a vaga desta máquina no servidor e apaga a licença local. */
  async deactivate() {
    const key = this.state.key;
    if (key) {
      try {
        await this.call('licenses/deactivate', {
          key,
          machine_id: this.getMachineId(),
        });
      } catch {
        // sem internet: a vaga pode ser liberada pelo painel
      }
    }
    await this.audit.log({ action: 'LICENSE_DEACTIVATE', entity: 'license' });
    this.save({ ...EMPTY, last_seen: this.state.last_seen });
    return this.status();
  }
}
