import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators';
import { FINAL_STATUSES } from '../common/enums';
import { round2 } from '../common/money';
import {
  orderByFrom,
  paginate,
  PaginationQueryDto,
} from '../common/pagination';
import { ORDER_LIST_INCLUDE, serializeOrder } from '../orders/order.include';
import {
  ClientsQueryDto,
  CreateClientDto,
  UpdateClientDto,
} from './clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ClientsQueryDto) {
    const where: Prisma.clientsWhereInput = {
      ...(!query.include_deleted && { deleted_at: null }),
      ...(query.type && { type: query.type }),
      ...(query.q && { OR: searchFilter(query.q) }),
    };
    return paginate(
      query,
      () => this.prisma.clients.count({ where }),
      (page) =>
        this.prisma.clients.findMany({
          where,
          ...page,
          orderBy: orderByFrom(
            query,
            ['name', 'created_at', 'updated_at', 'city'],
            { name: 'asc' },
          ),
          include: { _count: { select: { orders: true } } },
        }),
    );
  }

  async findById(id: number) {
    const client = await this.prisma.clients.findUnique({
      where: { client_id: id },
      include: { _count: { select: { orders: true } } },
    });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const [open, spent, last] = await Promise.all([
      this.prisma.orders.count({
        where: { owner_id: id, status: { notIn: [...FINAL_STATUSES] } },
      }),
      this.prisma.payments.aggregate({
        where: { order: { owner_id: id } },
        _sum: { amount: true },
      }),
      this.prisma.orders.findFirst({
        where: { owner_id: id },
        orderBy: { arrived_at: 'desc' },
        select: { arrived_at: true },
      }),
    ]);
    return {
      ...client,
      stats: {
        orders_total: client._count.orders,
        orders_open: open,
        total_spent: round2(spent._sum.amount ?? 0),
        last_order_at: last?.arrived_at ?? null,
      },
    };
  }

  async orders(id: number, query: PaginationQueryDto) {
    await this.ensureExists(id);
    const where = { owner_id: id };
    const result = await paginate(
      query,
      () => this.prisma.orders.count({ where }),
      (page) =>
        this.prisma.orders.findMany({
          where,
          ...page,
          orderBy: orderByFrom(
            query,
            ['number', 'arrived_at', 'status', 'total'],
            { arrived_at: 'desc' },
          ),
          include: ORDER_LIST_INCLUDE,
        }),
    );
    return { ...result, data: result.data.map(serializeOrder) };
  }

  async create(dto: CreateClientDto, user: AuthUser, force = false) {
    if (!force) await this.checkConflicts(dto);
    return this.prisma.clients.create({
      data: { ...dto, created_by: user.user_id },
      include: { _count: { select: { orders: true } } },
    });
  }

  async update(id: number, dto: UpdateClientDto, force = false) {
    await this.ensureExists(id);
    if (!force) await this.checkConflicts(dto, id);
    return this.prisma.clients.update({
      where: { client_id: id },
      data: dto,
      include: { _count: { select: { orders: true } } },
    });
  }

  async softDelete(id: number) {
    await this.ensureExists(id);
    await this.prisma.clients.update({
      where: { client_id: id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log({
      action: 'CLIENT_DELETE',
      entity: 'clients',
      entity_id: id,
    });
  }

  private async ensureExists(id: number) {
    const found = await this.prisma.clients.findFirst({
      where: { client_id: id, deleted_at: null },
      select: { client_id: true },
    });
    if (!found) throw new NotFoundException('Cliente não encontrado.');
  }

  /** 409 se já existir cliente ativo com o mesmo documento ou e-mail. */
  private async checkConflicts(
    dto: { document?: string | null; email?: string | null },
    exceptId?: number,
  ) {
    const checks: [keyof typeof dto, string][] = [
      ['document', 'Já existe um cliente com este CPF/CNPJ.'],
      ['email', 'Já existe um cliente com este e-mail.'],
    ];
    for (const [field, message] of checks) {
      const value = dto[field];
      if (!value) continue;
      const existing = await this.prisma.clients.findFirst({
        where: {
          [field]: value,
          deleted_at: null,
          ...(exceptId && { NOT: { client_id: exceptId } }),
        },
        select: { client_id: true, name: true },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message,
          error: 'Conflict',
          field,
          client: existing,
        });
      }
    }
  }
}

function searchFilter(q: string): Prisma.clientsWhereInput[] {
  const digits = q.replace(/\D/g, '');
  return [
    { name: { contains: q } },
    { email: { contains: q.toLowerCase() } },
    { phone: { contains: q } },
    { phone2: { contains: q } },
    ...(digits.length >= 3
      ? [{ document: { contains: digits } }, { phone: { contains: digits } }]
      : []),
  ];
}
