import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { AuthUser } from '../common/decorators';
import {
  FINAL_STATUSES,
  HistoryType,
  ORDER_STATUSES,
  OrderStatus,
} from '../common/enums';
import { round2 } from '../common/money';
import { orderByFrom, paginate } from '../common/pagination';
import { endOfDayIfDate } from '../common/period';
import { moveStock } from '../catalog/stock';
import { USER_REF } from '../users/user.select';
import {
  ORDER_DETAIL_INCLUDE,
  ORDER_LIST_INCLUDE,
  generateTrackingCode,
  serializeOrder,
  stringifyChecklist,
} from './order.include';
import {
  CommentDto,
  CreateOrderDto,
  CreatePaymentDto,
  ItemInputDto,
  OrdersQueryDto,
  PrintDto,
  UpdateItemDto,
  UpdateOrderDto,
  UpdateStatusDto,
} from './orders.dto';

type Tx = Prisma.TransactionClient;

// Campos que o técnico pode alterar via PUT.
const TECHNICIAN_FIELDS = [
  'diagnosis',
  'solution',
  'internal_notes',
  'serial',
  'condition',
  'checklist',
];

const STATUS_LABEL: Record<OrderStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADA: 'Aprovada',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_REPARO: 'Em reparo',
  PRONTA: 'Pronta',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

const isFinal = (status: string) =>
  FINAL_STATUSES.includes(status as OrderStatus);
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 86400_000);

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------- leitura

  async list(query: OrdersQueryDto) {
    const where = buildWhere(query);
    const result = await paginate(
      query,
      () => this.prisma.orders.count({ where }),
      (page) =>
        this.prisma.orders.findMany({
          where,
          ...page,
          include: ORDER_LIST_INCLUDE,
          orderBy: orderByFrom(
            query,
            [
              'number',
              'arrived_at',
              'due_date',
              'status',
              'priority',
              'total',
              'updated_at',
              'device',
            ],
            { arrived_at: 'desc' },
          ),
        }),
    );
    return { ...result, data: result.data.map(serializeOrder) };
  }

  async board() {
    const since = addDays(new Date(), -7);
    const orders = await this.prisma.orders.findMany({
      where: {
        OR: [
          { status: { notIn: [...FINAL_STATUSES] } },
          { status: { in: [...FINAL_STATUSES] }, updated_at: { gte: since } },
        ],
      },
      include: ORDER_LIST_INCLUDE,
      orderBy: [{ due_date: 'asc' }, { arrived_at: 'asc' }],
    });
    const board = Object.fromEntries(
      ORDER_STATUSES.map((s) => [s, [] as typeof orders]),
    );
    for (const order of orders)
      board[order.status]?.push(serializeOrder(order));
    return board;
  }

  async findById(id: number, db: Tx | PrismaService = this.prisma) {
    const order = await db.orders.findUnique({
      where: { order_id: id },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    return serializeOrder(order);
  }

  // ---------------------------------------------------------------- escrita

  async create(dto: CreateOrderDto, user: AuthUser) {
    const settings = await this.settings.getAll();
    if (settings.orders.require_technician && !dto.technician_id) {
      throw new BadRequestException('Informe o técnico responsável.');
    }
    const { items, tags, due_date, arrived_at, checklist, ...fields } = dto;

    const orderId = await withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.ensureClient(tx, dto.owner_id);
        if (dto.technician_id)
          await this.ensureTechnician(tx, dto.technician_id);

        const last = await tx.orders.aggregate({ _max: { number: true } });
        const order = await tx.orders.create({
          data: {
            ...fields,
            number: (last._max.number ?? 0) + 1,
            tracking_code: await this.uniqueTrackingCode(tx),
            created_by_id: user.user_id,
            warranty_days:
              dto.warranty_days ?? settings.orders.default_warranty_days,
            due_date: due_date ? new Date(due_date) : null,
            ...(arrived_at && { arrived_at: new Date(arrived_at) }),
            checklist: stringifyChecklist(checklist),
            tags: tags?.length
              ? { create: uniqueTags(tags).map((slug) => ({ slug })) }
              : undefined,
          },
        });
        await this.history(tx, order.order_id, user, 'CREATED', {
          to_status: order.status,
          message: 'OS criada.',
        });
        for (const item of items ?? [])
          await this.insertItem(tx, order.order_id, item, user, false);
        await this.recalc(tx, order.order_id);
        return order.order_id;
      }),
    );
    return this.findById(orderId);
  }

  async update(id: number, dto: UpdateOrderDto, user: AuthUser) {
    const current = await this.getOrder(id);
    if (user.role === 'TECNICO') {
      const denied = Object.keys(dto).filter(
        (k) => !TECHNICIAN_FIELDS.includes(k),
      );
      if (denied.length) {
        throw new ForbiddenException(
          `Técnicos só podem alterar: ${TECHNICIAN_FIELDS.join(', ')}.`,
        );
      }
    }
    if (isFinal(current.status) && user.role !== 'ADMIN') {
      throw new BadRequestException(
        'OS finalizada só pode ser alterada por um administrador.',
      );
    }

    const { tags, due_date, arrived_at, checklist, ...fields } = dto;
    await this.prisma.$transaction(async (tx) => {
      if (dto.owner_id && dto.owner_id !== current.owner_id)
        await this.ensureClient(tx, dto.owner_id);
      if (dto.technician_id && dto.technician_id !== current.technician_id) {
        await this.ensureTechnician(tx, dto.technician_id);
      }
      await tx.orders.update({
        where: { order_id: id },
        data: {
          ...fields,
          ...(due_date !== undefined && {
            due_date: due_date ? new Date(due_date) : null,
          }),
          ...(arrived_at && { arrived_at: new Date(arrived_at) }),
          ...(checklist !== undefined && {
            checklist: stringifyChecklist(checklist),
          }),
          ...(dto.warranty_days !== undefined &&
            current.delivered_at && {
              warranty_until:
                dto.warranty_days > 0
                  ? addDays(current.delivered_at, dto.warranty_days)
                  : null,
            }),
        },
      });
      if (tags) {
        await tx.tags.deleteMany({ where: { order_id: id } });
        if (tags.length) {
          await tx.tags.createMany({
            data: uniqueTags(tags).map((slug) => ({ slug, order_id: id })),
          });
        }
      }
      if (dto.discount !== undefined) await this.recalc(tx, id);
      const changed = Object.keys(dto).filter((k) => k !== 'device_password');
      if (dto.device_password !== undefined) changed.push('senha do aparelho');
      if (changed.length) {
        await this.history(tx, id, user, 'UPDATE', {
          message: `Campos alterados: ${changed.join(', ')}.`,
        });
      }
    });
    return this.findById(id);
  }

  async updateStatus(id: number, dto: UpdateStatusDto, user: AuthUser) {
    const current = await this.getOrder(id);
    const to = dto.status;
    if (current.status === to) return this.findById(id);
    if (to === 'CANCELADA' && !dto.message) {
      throw new BadRequestException('Informe o motivo do cancelamento.');
    }

    if (isFinal(current.status)) {
      if (user.role !== 'ADMIN') {
        throw new ForbiddenException(
          'Somente administradores podem reabrir uma OS finalizada.',
        );
      }
      if (to !== 'ABERTA') {
        throw new BadRequestException(
          'Uma OS finalizada só pode ser reaberta com o status ABERTA.',
        );
      }
    }

    const now = new Date();
    const data: Prisma.ordersUpdateInput = { status: to };
    if (to === 'PRONTA') {
      data.finished_at = now;
    } else if (to === 'ENTREGUE') {
      data.delivered_at = now;
      data.finished_at = current.finished_at ?? now;
      data.warranty_until =
        current.warranty_days > 0 ? addDays(now, current.warranty_days) : null;
    } else if (to !== 'CANCELADA') {
      // Voltou para uma etapa anterior (retrabalho ou reabertura).
      data.finished_at = null;
      data.delivered_at = null;
      data.warranty_until = null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orders.update({ where: { order_id: id }, data });
      const label = `${STATUS_LABEL[current.status as OrderStatus] ?? current.status} → ${STATUS_LABEL[to]}`;
      await this.history(tx, id, user, 'STATUS', {
        from_status: current.status,
        to_status: to,
        message: dto.message ? `${label}: ${dto.message}` : label,
      });
    });
    if (isFinal(current.status)) {
      await this.audit.log({
        action: 'ORDER_REOPEN',
        entity: 'orders',
        entity_id: id,
        meta: { number: current.number, from: current.status },
      });
    }
    return this.findById(id);
  }

  async remove(id: number, user: AuthUser) {
    const order = await this.getOrder(id);
    await this.prisma.$transaction(async (tx) => {
      const items = await tx.order_items.findMany({
        where: { order_id: id, product_id: { not: null } },
      });
      for (const item of items) {
        await moveStock(tx, {
          product_id: item.product_id,
          delta: item.quantity,
          type: 'ORDER_IN',
          reason: `Exclusão da OS ${order.number}`,
          user_id: user.user_id,
        });
      }
      await tx.orders.delete({ where: { order_id: id } });
    });
    await this.audit.log({
      action: 'ORDER_DELETE',
      entity: 'orders',
      entity_id: id,
      meta: {
        number: order.number,
        owner_id: order.owner_id,
        total: order.total,
        paid: order.paid,
      },
    });
  }

  // ------------------------------------------------------------------ itens

  async addItem(id: number, dto: ItemInputDto, user: AuthUser) {
    await this.ensureEditable(id);
    await this.prisma.$transaction(async (tx) => {
      await this.insertItem(tx, id, dto, user, true);
      await this.recalc(tx, id);
    });
    return this.findById(id);
  }

  async updateItem(
    id: number,
    itemId: number,
    dto: UpdateItemDto,
    user: AuthUser,
  ) {
    await this.ensureEditable(id);
    const item = await this.getItem(id, itemId);
    await this.prisma.$transaction(async (tx) => {
      const quantity = dto.quantity ?? item.quantity;
      const unitPrice = dto.unit_price ?? item.unit_price;
      if (item.product_id && quantity !== item.quantity) {
        await moveStock(tx, {
          product_id: item.product_id,
          delta: item.quantity - quantity,
          type: quantity > item.quantity ? 'ORDER_OUT' : 'ORDER_IN',
          reason: `Ajuste de item na OS`,
          order_id: id,
          user_id: user.user_id,
        });
      }
      const updated = await tx.order_items.update({
        where: { item_id: itemId },
        data: {
          description: dto.description ?? item.description,
          quantity,
          unit_price: unitPrice,
          total: round2(quantity * unitPrice),
        },
      });
      await this.history(tx, id, user, 'ITEM', {
        message: `Item alterado: ${updated.description} (${updated.quantity} × ${money(updated.unit_price)}).`,
      });
      await this.recalc(tx, id);
    });
    return this.findById(id);
  }

  async removeItem(id: number, itemId: number, user: AuthUser) {
    await this.ensureEditable(id);
    const item = await this.getItem(id, itemId);
    await this.prisma.$transaction(async (tx) => {
      if (item.product_id) {
        await moveStock(tx, {
          product_id: item.product_id,
          delta: item.quantity,
          type: 'ORDER_IN',
          reason: 'Item removido da OS',
          order_id: id,
          user_id: user.user_id,
        });
      }
      await tx.order_items.delete({ where: { item_id: itemId } });
      await this.history(tx, id, user, 'ITEM', {
        message: `Item removido: ${item.description}.`,
      });
      await this.recalc(tx, id);
    });
    return this.findById(id);
  }

  // ------------------------------------------------------------- pagamentos

  async addPayment(id: number, dto: CreatePaymentDto, user: AuthUser) {
    await this.getOrder(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.payments.create({
        data: {
          order_id: id,
          method: dto.method,
          amount: round2(dto.amount),
          paid_at: dto.paid_at ? new Date(dto.paid_at) : new Date(),
          notes: dto.notes ?? null,
          user_id: user.user_id,
        },
      });
      await this.history(tx, id, user, 'PAYMENT', {
        message: `Pagamento de ${money(dto.amount)} (${dto.method}).`,
      });
      await this.recalc(tx, id);
    });
    return this.findById(id);
  }

  async removePayment(id: number, paymentId: number, user: AuthUser) {
    const payment = await this.prisma.payments.findFirst({
      where: { payment_id: paymentId, order_id: id },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.payments.delete({ where: { payment_id: paymentId } });
      await this.history(tx, id, user, 'PAYMENT', {
        message: `Pagamento removido: ${money(payment.amount)} (${payment.method}).`,
      });
      await this.recalc(tx, id);
    });
    await this.audit.log({
      action: 'PAYMENT_DELETE',
      entity: 'payments',
      entity_id: paymentId,
      meta: { order_id: id, amount: payment.amount, method: payment.method },
    });
    return this.findById(id);
  }

  // ------------------------------------------------------ histórico avulso

  async comment(id: number, dto: CommentDto, user: AuthUser) {
    await this.getOrder(id);
    return this.history(this.prisma, id, user, 'COMMENT', {
      message: dto.message,
    });
  }

  async print(id: number, dto: PrintDto, user: AuthUser) {
    await this.getOrder(id);
    return this.history(this.prisma, id, user, 'PRINT', {
      message: `Impressão (${dto.layout === 'A4' ? 'A4' : 'térmica'}).`,
    });
  }

  // ---------------------------------------------------------------- helpers

  /** Recalcula totais a partir dos itens e pagamentos. */
  async recalc(tx: Tx, id: number) {
    const [items, payments, order] = await Promise.all([
      tx.order_items.groupBy({
        by: ['kind'],
        where: { order_id: id },
        _sum: { total: true },
      }),
      tx.payments.aggregate({
        where: { order_id: id },
        _sum: { amount: true },
      }),
      tx.orders.findUniqueOrThrow({
        where: { order_id: id },
        select: { discount: true },
      }),
    ]);
    const sum = (kind: string) =>
      items.find((i) => i.kind === kind)?._sum.total ?? 0;
    const totalServices = round2(sum('SERVICE'));
    const totalProducts = round2(sum('PRODUCT'));
    await tx.orders.update({
      where: { order_id: id },
      data: {
        total_services: totalServices,
        total_products: totalProducts,
        total: round2(
          Math.max(0, totalServices + totalProducts - order.discount),
        ),
        paid: round2(payments._sum.amount ?? 0),
      },
    });
  }

  private async insertItem(
    tx: Tx,
    orderId: number,
    dto: ItemInputDto,
    user: AuthUser,
    log: boolean,
  ) {
    let description = dto.description ?? null;
    let unitPrice = dto.unit_price;
    let serviceId: number | null = null;
    let productId: number | null = null;

    if (dto.kind === 'SERVICE') {
      if (dto.product_id)
        throw new BadRequestException(
          'Itens de serviço não aceitam product_id.',
        );
      if (dto.service_id) {
        const service = await tx.services.findUnique({
          where: { service_id: dto.service_id },
        });
        if (!service || !service.active)
          throw new BadRequestException('Serviço não encontrado ou inativo.');
        serviceId = service.service_id;
        description ??= service.name;
        unitPrice ??= service.price;
      }
    } else {
      if (dto.service_id)
        throw new BadRequestException(
          'Itens de produto não aceitam service_id.',
        );
      if (dto.product_id) {
        const product = await tx.products.findUnique({
          where: { product_id: dto.product_id },
        });
        if (!product || !product.active)
          throw new BadRequestException('Produto não encontrado ou inativo.');
        productId = product.product_id;
        description ??= product.name;
        unitPrice ??= product.sale_price;
      }
    }
    if (!description)
      throw new BadRequestException('Informe a descrição do item.');
    unitPrice = round2(unitPrice ?? 0);

    const item = await tx.order_items.create({
      data: {
        order_id: orderId,
        kind: dto.kind,
        service_id: serviceId,
        product_id: productId,
        description,
        quantity: dto.quantity,
        unit_price: unitPrice,
        total: round2(dto.quantity * unitPrice),
      },
    });
    if (productId) {
      await moveStock(tx, {
        product_id: productId,
        delta: -dto.quantity,
        type: 'ORDER_OUT',
        reason: 'Item adicionado à OS',
        order_id: orderId,
        user_id: user.user_id,
      });
    }
    if (log) {
      await this.history(tx, orderId, user, 'ITEM', {
        message: `Item adicionado: ${description} (${dto.quantity} × ${money(unitPrice)}).`,
      });
    }
    return item;
  }

  private history(
    db: Tx | PrismaService,
    orderId: number,
    user: AuthUser,
    type: HistoryType,
    data: { from_status?: string; to_status?: string; message?: string },
  ) {
    return db.order_history.create({
      data: { order_id: orderId, user_id: user.user_id, type, ...data },
      select: {
        history_id: true,
        order_id: true,
        type: true,
        from_status: true,
        to_status: true,
        message: true,
        created_at: true,
        user: USER_REF,
      },
    });
  }

  private async getOrder(id: number) {
    const order = await this.prisma.orders.findUnique({
      where: { order_id: id },
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    return order;
  }

  private async getItem(orderId: number, itemId: number) {
    const item = await this.prisma.order_items.findFirst({
      where: { item_id: itemId, order_id: orderId },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');
    return item;
  }

  private async ensureEditable(id: number) {
    const order = await this.getOrder(id);
    if (isFinal(order.status)) {
      throw new BadRequestException(
        'Não é possível alterar itens de uma OS finalizada. Reabra a OS primeiro.',
      );
    }
    return order;
  }

  private async ensureClient(tx: Tx, clientId: number) {
    const client = await tx.clients.findFirst({
      where: { client_id: clientId, deleted_at: null },
    });
    if (!client) throw new BadRequestException('Cliente não encontrado.');
  }

  private async ensureTechnician(tx: Tx, userId: number) {
    const tech = await tx.users.findFirst({
      where: { user_id: userId, active: true },
    });
    if (!tech)
      throw new BadRequestException('Técnico não encontrado ou inativo.');
  }

  private async uniqueTrackingCode(tx: Tx) {
    for (let i = 0; i < 10; i++) {
      const code = generateTrackingCode();
      if (
        !(await tx.orders.findUnique({
          where: { tracking_code: code },
          select: { order_id: true },
        }))
      ) {
        return code;
      }
    }
    throw new Error('Não foi possível gerar um código de rastreio único.');
  }
}

function buildWhere(query: OrdersQueryDto): Prisma.ordersWhereInput {
  const and: Prisma.ordersWhereInput[] = [];
  if (query.status?.length) and.push({ status: { in: query.status } });
  if (query.priority?.length) and.push({ priority: { in: query.priority } });
  if (query.technician_id) and.push({ technician_id: query.technician_id });
  if (query.owner_id) and.push({ owner_id: query.owner_id });
  if (query.tag) and.push({ tags: { some: { slug: query.tag } } });
  if (query.from || query.to) {
    and.push({
      arrived_at: {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: endOfDayIfDate(query.to) }),
      },
    });
  }
  if (query.overdue) {
    and.push({
      due_date: { lt: new Date() },
      status: { notIn: [...FINAL_STATUSES] },
    });
  }
  if (query.q) {
    const q = query.q;
    const numberMatch = /^(?:[a-z]{1,5}-?)?0*(\d{1,9})$/i.exec(q);
    and.push({
      OR: [
        { device: { contains: q } },
        { description: { contains: q } },
        { serial: { contains: q } },
        { brand: { contains: q } },
        { model: { contains: q } },
        { tracking_code: q.toUpperCase() },
        { owner: { name: { contains: q } } },
        ...(numberMatch ? [{ number: Number(numberMatch[1]) }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** Repete quando duas OS simultâneas disputam o mesmo `number` (P2002). */
async function withUniqueRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const conflict =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
      if (!conflict || i >= attempts) throw e;
    }
  }
}

function uniqueTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
