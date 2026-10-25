import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { loadConfig } from '../config/env';
import { comparePassword, hashPassword } from '../common/password';
import { lookupSeedRows } from '../lookups/lookup-seeds';
import { USER_SELECT } from '../users/user.select';
import { JwtPayload } from '../common/guards';
import { getRequestContext } from '../common/request-context';
import { LoginDto, SetupDto } from './auth.dto';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
const INVALID_CREDENTIALS = 'Credenciais inválidas.';

export type ClientMeta = { ip: string | null; user_agent: string | null };

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly config = loadConfig();
  // Hash fictício para comparar quando o usuário não existe (tempo de resposta uniforme).
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async status() {
    const users = await this.prisma.users.count();
    return { needs_setup: users === 0 };
  }

  async setup(dto: SetupDto, meta: ClientMeta) {
    const password = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      if ((await tx.users.count()) > 0) {
        throw new ForbiddenException(
          'A configuração inicial já foi realizada.',
        );
      }
      const created = await tx.users.create({
        data: {
          name: dto.name,
          username: dto.username,
          email: dto.email,
          password,
          role: 'ADMIN',
        },
        select: USER_SELECT,
      });
      for (const row of lookupSeedRows()) {
        await tx.lookups.upsert({
          where: { kind_name: { kind: row.kind, name: row.name } },
          create: row,
          update: {},
        });
      }
      if (dto.company_name)
        await this.settings.update({ company: { name: dto.company_name } }, tx);
      return created;
    });
    await this.audit.log({
      action: 'SETUP',
      entity: 'users',
      entity_id: user.user_id,
      user_id: user.user_id,
    });
    return this.issueTokens(user, meta);
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const user = await this.prisma.users.findFirst({
      where: { OR: [{ email: dto.login }, { username: dto.login }] },
    });

    if (!user || !user.active) {
      await comparePassword(dto.password, await this.getDummyHash());
      await this.audit.log({
        action: 'LOGIN_FAILED',
        entity: 'users',
        meta: { login: dto.login },
        user_id: user?.user_id ?? null,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.locked_until && user.locked_until > new Date()) {
      const minutes = Math.ceil(
        (user.locked_until.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Muitas tentativas inválidas. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    if (!(await comparePassword(dto.password, user.password))) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await this.prisma.users.update({
        where: { user_id: user.user_id },
        data: lock
          ? {
              failed_attempts: 0,
              locked_until: new Date(Date.now() + LOCKOUT_MINUTES * 60000),
            }
          : { failed_attempts: attempts },
      });
      await this.audit.log({
        action: lock ? 'USER_LOCKED' : 'LOGIN_FAILED',
        entity: 'users',
        entity_id: user.user_id,
        user_id: user.user_id,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const updated = await this.prisma.users.update({
      where: { user_id: user.user_id },
      data: {
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
      },
      select: USER_SELECT,
    });
    await this.audit.log({
      action: 'LOGIN',
      entity: 'users',
      entity_id: user.user_id,
      user_id: user.user_id,
    });
    return this.issueTokens(updated, meta);
  }

  /** Troca um refresh token válido por um novo par (rotação). */
  async refresh(token: string | undefined, meta: ClientMeta) {
    if (!token)
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    const session = await this.prisma.sessions.findUnique({
      where: { token_hash: hashToken(token) },
      include: { user: { select: { ...USER_SELECT } } },
    });
    if (!session)
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');

    if (session.revoked_at) {
      // Reuso de token já rotacionado: possível roubo. Derruba todas as sessões do usuário.
      await this.revokeAllSessions(session.user_id);
      await this.audit.log({
        action: 'REFRESH_REUSE',
        entity: 'sessions',
        entity_id: session.session_id,
        user_id: session.user_id,
      });
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    if (session.expires_at < new Date() || !session.user.active) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    await this.prisma.sessions.update({
      where: { session_id: session.session_id },
      data: { revoked_at: new Date(), last_used_at: new Date() },
    });
    return this.issueTokens(session.user, meta);
  }

  async logout(token: string | undefined, sessionId: number | null) {
    const now = new Date();
    if (token) {
      await this.prisma.sessions.updateMany({
        where: { token_hash: hashToken(token), revoked_at: null },
        data: { revoked_at: now },
      });
    }
    if (sessionId) {
      await this.prisma.sessions.updateMany({
        where: { session_id: sessionId, revoked_at: null },
        data: { revoked_at: now },
      });
    }
  }

  /** Revoga as sessões do usuário, opcionalmente preservando uma (a atual). */
  async revokeAllSessions(userId: number, exceptSessionId?: number | null) {
    await this.prisma.sessions.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
        ...(exceptSessionId && { NOT: { session_id: exceptSessionId } }),
      },
      data: { revoked_at: new Date() },
    });
  }

  private async issueTokens(
    user: { user_id: number; username: string; role: string } & Record<
      string,
      unknown
    >,
    meta: ClientMeta,
  ) {
    const refreshToken = randomBytes(64).toString('hex');
    const session = await this.prisma.sessions.create({
      data: {
        user_id: user.user_id,
        token_hash: hashToken(refreshToken),
        ip: meta.ip,
        user_agent: meta.user_agent?.slice(0, 300) ?? null,
        expires_at: new Date(
          Date.now() + this.config.refreshTtlDays * 86400_000,
        ),
      },
    });
    // Limpeza oportunista de sessões vencidas/revogadas há mais de 7 dias.
    await this.prisma.sessions.deleteMany({
      where: {
        user_id: user.user_id,
        OR: [
          { expires_at: { lt: new Date() } },
          { revoked_at: { lt: new Date(Date.now() - 7 * 86400_000) } },
        ],
      },
    });

    const payload: JwtPayload = {
      sub: user.user_id,
      username: user.username,
      role: user.role as JwtPayload['role'],
      sid: session.session_id,
      ...(getRequestContext().tenant && { tid: getRequestContext().tenant.id }),
    };
    return {
      access_token: await this.jwt.signAsync(payload),
      refresh_token: refreshToken,
      expires_in: this.config.jwtExpiresInSeconds,
      user,
    };
  }

  private getDummyHash() {
    this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}
