import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { orderByFrom, paginate } from '../common/pagination';
import {
  countBy,
  endOfDayIfDate,
  resolvePeriod,
  weekKey,
  dayKey,
} from '../common/period';
import { USER_REF } from '../users/user.select';
import {
  CreateFailureDto,
  FailuresQueryDto,
  PeriodQueryDto,
  UpdateFailureDto,
} from './failures.dto';

const FAILURE_INCLUDE = {
  order: {
    select: {
      order_id: true,
      number: true,
      device: true,
      owner: { select: { name: true } },
    },
  },
  user: USER_REF,
} satisfies Prisma.delivery_failuresInclude;

const strip = <T extends { user_id?: unknown }>({ user_id: _u, ...rest }: T) =>
  rest;

@Injectable()
export class FailuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: FailuresQueryDto) {
    const where: Prisma.delivery_failuresWhereInput = {
      ...(query.category && { category: query.category }),
      ...(query.resolved !== undefined && { resolved: query.resolved }),
      ...(query.technician_id && { technician_id: query.technician_id }),
      ...((query.from || query.to) && {
        occurred_at: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: endOfDayIfDate(query.to) }),
        },
      }),
      ...(query.q && {
        OR: [
          { reason: { contains: query.q } },
          { description: { contains: query.q } },
          { order: { device: { contains: query.q } } },
          { order: { owner: { name: { contains: query.q } } } },
          ...(/^\d+$/.test(query.q)
            ? [{ order: { number: Number(query.q) } }]
            : []),
        ],
      }),
    };
    const result = await paginate(
      query,
      () => this.prisma.delivery_failures.count({ where }),
      (page) =>
        this.prisma.delivery_failures.findMany({
          where,
          ...page,
          include: FAILURE_INCLUDE,
          orderBy: orderByFrom(
            query,
            ['occurred_at', 'category', 'reason', 'resolved'],
            { occurred_at: 'desc' },
          ),
        }),
    );
    return { ...result, data: result.data.map(strip) };
  }

  async listForOrder(orderId: number) {
    await this.ensureOrder(orderId);
    const rows = await this.prisma.delivery_failures.findMany({
      where: { order_id: orderId },
      include: FAILURE_INCLUDE,
      orderBy: { occurred_at: 'desc' },
    });
    return rows.map(strip);
  }

  async create(orderId: number, dto: CreateFailureDto, user: AuthUser) {
    const order = await this.ensureOrder(orderId);
    const failure = await this.prisma.$transaction(async (tx) => {
      const created = await tx.delivery_failures.create({
        data: {
          order_id: orderId,
          category: dto.category,
          reason: dto.reason,
          description: dto.description ?? null,
          occurred_at: dto.occurred_at ? new Date(dto.occurred_at) : new Date(),
          technician_id: order.technician_id,
          user_id: user.user_id,
        },
        include: FAILURE_INCLUDE,
      });
      await tx.order_history.create({
        data: {
          order_id: orderId,
          user_id: user.user_id,
          type: 'FAILURE',
          message: `Falha registrada (${dto.category}): ${dto.reason}.`,
        },
      });
      return created;
    });
    return strip(failure);
  }

  async update(id: number, dto: UpdateFailureDto, user: AuthUser) {
    const current = await this.prisma.delivery_failures.findUnique({
      where: { failure_id: id },
    });
    if (!current) throw new NotFoundException('Falha não encontrada.');

    const resolvedChanged =
      dto.resolved !== undefined && dto.resolved !== current.resolved;
    const failure = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery_failures.update({
        where: { failure_id: id },
        data: {
          ...dto,
          ...(dto.occurred_at && { occurred_at: new Date(dto.occurred_at) }),
          ...(resolvedChanged && {
            resolved_at: dto.resolved ? new Date() : null,
          }),
        },
        include: FAILURE_INCLUDE,
      });
      if (resolvedChanged) {
        await tx.order_history.create({
          data: {
            order_id: current.order_id,
            user_id: user.user_id,
            type: 'FAILURE',
            message: dto.resolved
              ? `Falha resolvida: ${current.reason}${dto.resolution ? ` — ${dto.resolution}` : ''}.`
              : `Falha reaberta: ${current.reason}.`,
          },
        });
      }
      return updated;
    });
    return strip(failure);
  }

  async remove(id: number) {
    const current = await this.prisma.delivery_failures.findUnique({
      where: { failure_id: id },
    });
    if (!current) throw new NotFoundException('Falha não encontrada.');
    await this.prisma.delivery_failures.delete({ where: { failure_id: id } });
    await this.audit.log({
      action: 'FAILURE_DELETE',
      entity: 'delivery_failures',
      entity_id: id,
      meta: {
        order_id: current.order_id,
        category: current.category,
        reason: current.reason,
      },
    });
  }

  async stats(query: PeriodQueryDto) {
    const { from, to } = resolvePeriod(query.from, query.to, 90);
    const [failures, delivered] = await Promise.all([
      this.prisma.delivery_failures.findMany({
        where: { occurred_at: { gte: from, lte: to } },
        include: {
          order: { select: { device_type: true, brand: true } },
          technician: { select: { user_id: true, name: true } },
        },
      }),
      this.prisma.orders.findMany({
        where: { status: 'ENTREGUE', delivered_at: { gte: from, lte: to } },
        select: {
          technician_id: true,
          technician: { select: { user_id: true, name: true } },
        },
      }),
    ]);

    const resolved = failures.filter((f) => f.resolved);
    const resolutionHours = resolved
      .filter((f) => f.resolved_at)
      .map(
        (f) => (f.resolved_at.getTime() - f.occurred_at.getTime()) / 3600_000,
      );

    // OS sem técnico entram no grupo { user_id: null, name: 'Sem técnico' }.
    const NO_TECH = { user_id: null as number | null, name: 'Sem técnico' };
    const technicians = new Map<
      number | null,
      { user_id: number | null; name: string; count: number; delivered: number }
    >();
    const techEntry = (t: { user_id: number | null; name: string } | null) => {
      const tech = t ?? NO_TECH;
      if (!technicians.has(tech.user_id))
        technicians.set(tech.user_id, { ...tech, count: 0, delivered: 0 });
      return technicians.get(tech.user_id);
    };
    for (const f of failures) techEntry(f.technician).count++;
    for (const o of delivered) techEntry(o.technician).delivered++;

    // Buckets diários até 31 dias; acima disso, semanais (segunda-feira).
    const daily = to.getTime() - from.getTime() <= 31 * 86400_000;
    const timeline = new Map<string, number>();
    for (const f of failures) {
      const key = daily ? dayKey(f.occurred_at) : weekKey(f.occurred_at);
      timeline.set(key, (timeline.get(key) ?? 0) + 1);
    }

    return {
      period: { from, to },
      total: failures.length,
      open: failures.length - resolved.length,
      resolved: resolved.length,
      rate: delivered.length ? round4(failures.length / delivered.length) : 0,
      by_category: countBy(failures, (f) => f.category),
      by_reason: countBy(failures, (f) => f.reason, 20),
      by_technician: [...technicians.values()].sort(
        (a, b) => b.count - a.count,
      ),
      by_device_type: countBy(failures, (f) => f.order.device_type, 20),
      by_brand: countBy(failures, (f) => f.order.brand, 20),
      timeline: [...timeline.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      avg_resolution_hours: resolutionHours.length
        ? Math.round(
            (resolutionHours.reduce((a, b) => a + b, 0) /
              resolutionHours.length) *
              10,
          ) / 10
        : 0,
    };
  }

  private async ensureOrder(orderId: number) {
    const order = await this.prisma.orders.findUnique({
      where: { order_id: orderId },
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    return order;
  }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
