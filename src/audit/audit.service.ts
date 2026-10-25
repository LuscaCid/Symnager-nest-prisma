import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  orderByFrom,
  paginate,
  PaginationQueryDto,
} from '../common/pagination';
import { getRequestContext } from '../common/request-context';

export type AuditEntry = {
  action: string;
  entity: string;
  entity_id?: string | number | null;
  meta?: Record<string, unknown>;
  user_id?: number | null;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma ação sensível. Nunca derruba a requisição se falhar. */
  async log(entry: AuditEntry): Promise<void> {
    const ctx = getRequestContext();
    try {
      await this.prisma.audit_logs.create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entity_id: entry.entity_id != null ? String(entry.entity_id) : null,
          meta: entry.meta ? JSON.stringify(entry.meta) : null,
          user_id: entry.user_id !== undefined ? entry.user_id : ctx.user_id,
          ip: ctx.ip,
        },
      });
    } catch (e) {
      this.logger.warn(`Falha ao registrar auditoria: ${(e as Error).message}`);
    }
  }

  async list(
    query: PaginationQueryDto & {
      action?: string;
      entity?: string;
      user_id?: number;
    },
  ) {
    const where = {
      ...(query.action && { action: query.action }),
      ...(query.entity && { entity: query.entity }),
      ...(query.user_id && { user_id: query.user_id }),
      ...(query.q && {
        OR: [
          { action: { contains: query.q } },
          { entity: { contains: query.q } },
          { meta: { contains: query.q } },
          { ip: { contains: query.q } },
          { user: { name: { contains: query.q } } },
        ],
      }),
    };
    const result = await paginate(
      query,
      () => this.prisma.audit_logs.count({ where }),
      (page) =>
        this.prisma.audit_logs.findMany({
          where,
          ...page,
          orderBy: orderByFrom(query, ['created_at', 'action', 'entity'], {
            created_at: 'desc',
          }),
          include: { user: { select: { user_id: true, name: true } } },
        }),
    );
    return {
      ...result,
      data: result.data.map(({ user_id: _u, ...row }) => ({
        ...row,
        meta: row.meta ? safeParse(row.meta) : null,
      })),
    };
  }
}

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
