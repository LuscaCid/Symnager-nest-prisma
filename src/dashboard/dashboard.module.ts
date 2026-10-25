import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FINAL_STATUSES, ORDER_STATUSES } from '../common/enums';
import { round2 } from '../common/money';
import { countBy, dayKey, resolvePeriod } from '../common/period';
import { PeriodQueryDto } from '../failures/failures.dto';
import { ORDER_LIST_INCLUDE, serializeOrder } from '../orders/order.include';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: PeriodQueryDto) {
    const { from, to } = resolvePeriod(query.from, query.to, 30);
    const period = { gte: from, lte: to };
    const notFinal = { status: { notIn: [...FINAL_STATUSES] } };
    const now = new Date();

    const [
      open,
      overdue,
      readyWaiting,
      created,
      delivered,
      canceled,
      payments,
      receivableRows,
      failures,
      newClients,
      byStatus,
      items,
      technicianOrders,
      lowStockIds,
      recent,
    ] = await Promise.all([
      this.prisma.orders.count({ where: notFinal }),
      this.prisma.orders.count({
        where: { ...notFinal, due_date: { lt: now } },
      }),
      this.prisma.orders.count({ where: { status: 'PRONTA' } }),
      this.prisma.orders.findMany({
        where: { arrived_at: period },
        select: { arrived_at: true, device_type: true, brand: true },
      }),
      this.prisma.orders.findMany({
        where: { status: 'ENTREGUE', delivered_at: period },
        select: {
          delivered_at: true,
          total: true,
          arrived_at: true,
          finished_at: true,
        },
      }),
      this.prisma.orders.count({
        where: { status: 'CANCELADA', updated_at: period },
      }),
      this.prisma.payments.findMany({
        where: { paid_at: period },
        select: {
          paid_at: true,
          amount: true,
          order: { select: { technician_id: true } },
        },
      }),
      this.prisma.orders.findMany({
        where: { status: { in: ['PRONTA', 'ENTREGUE'] } },
        select: { total: true, paid: true },
      }),
      this.prisma.delivery_failures.count({ where: { occurred_at: period } }),
      this.prisma.clients.count({
        where: { created_at: period, deleted_at: null },
      }),
      this.prisma.orders.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order_items.findMany({
        where: {
          kind: 'SERVICE',
          order: { arrived_at: period },
        },
        select: {
          service_id: true,
          description: true,
          total: true,
          quantity: true,
          service: { select: { name: true } },
        },
      }),
      this.prisma.orders.findMany({
        where: {
          technician_id: { not: null },
          OR: [notFinal, { finished_at: period }],
        },
        select: {
          technician_id: true,
          status: true,
          finished_at: true,
          technician: { select: { user_id: true, name: true } },
        },
      }),
      this.prisma.$queryRawUnsafe<{ product_id: number }[]>(
        'SELECT product_id FROM products WHERE active = 1 AND stock <= min_stock ORDER BY stock ASC LIMIT 10',
      ),
      this.prisma.orders.findMany({
        take: 10,
        orderBy: { created_at: 'desc' },
        include: ORDER_LIST_INCLUDE,
      }),
    ]);

    const revenue = round2(payments.reduce((s, p) => s + p.amount, 0));
    const turnaround = delivered
      .filter((o) => o.finished_at)
      .map(
        (o) => (o.finished_at.getTime() - o.arrived_at.getTime()) / 3600_000,
      );

    // Séries diárias com todos os dias do período (dias sem movimento = 0).
    const days: string[] = [];
    for (
      let d = new Date(dayKey(from));
      d <= to;
      d = new Date(d.getTime() + 86400_000)
    )
      days.push(dayKey(d));
    const perDay = new Map(
      days.map((d) => [d, { date: d, created: 0, delivered: 0, amount: 0 }]),
    );
    for (const o of created) {
      const entry = perDay.get(dayKey(o.arrived_at));
      if (entry) entry.created++;
    }
    for (const o of delivered) {
      const entry = perDay.get(dayKey(o.delivered_at));
      if (entry) entry.delivered++;
    }
    for (const p of payments) {
      const entry = perDay.get(dayKey(p.paid_at));
      if (entry) entry.amount = round2(entry.amount + p.amount);
    }

    // Serviços do catálogo agrupam por id; itens avulsos (service_id null) por descrição.
    const services = new Map<
      string,
      { service_id: number | null; name: string; count: number; amount: number }
    >();
    for (const item of items) {
      const name = item.service?.name ?? item.description;
      const key = item.service_id
        ? `id:${item.service_id}`
        : `name:${name.toLowerCase()}`;
      const entry = services.get(key) ?? {
        service_id: item.service_id,
        name,
        count: 0,
        amount: 0,
      };
      entry.count += item.quantity;
      entry.amount = round2(entry.amount + item.total);
      services.set(key, entry);
    }

    const technicians = new Map<
      number,
      {
        user_id: number;
        name: string;
        open: number;
        finished: number;
        revenue: number;
      }
    >();
    for (const o of technicianOrders) {
      if (!o.technician) continue;
      const entry = technicians.get(o.technician.user_id) ?? {
        ...o.technician,
        open: 0,
        finished: 0,
        revenue: 0,
      };
      if (!FINAL_STATUSES.includes(o.status as never) && o.status !== 'PRONTA')
        entry.open++;
      if (o.finished_at && o.finished_at >= from && o.finished_at <= to)
        entry.finished++;
      technicians.set(o.technician.user_id, entry);
    }
    for (const p of payments) {
      const entry = p.order.technician_id
        ? technicians.get(p.order.technician_id)
        : undefined;
      if (entry) entry.revenue = round2(entry.revenue + p.amount);
    }

    const lowStock = lowStockIds.length
      ? await this.prisma.products.findMany({
          where: {
            product_id: { in: lowStockIds.map((r) => Number(r.product_id)) },
          },
          include: { supplier: { select: { supplier_id: true, name: true } } },
          orderBy: { stock: 'asc' },
        })
      : [];

    const statusCount = new Map(byStatus.map((s) => [s.status, s._count._all]));

    return {
      period: { from, to },
      kpis: {
        open,
        overdue,
        ready_waiting_pickup: readyWaiting,
        created: created.length,
        delivered: delivered.length,
        canceled,
        revenue,
        receivable: round2(
          receivableRows.reduce((s, o) => s + Math.max(0, o.total - o.paid), 0),
        ),
        avg_ticket: delivered.length
          ? round2(
              delivered.reduce((s, o) => s + o.total, 0) / delivered.length,
            )
          : 0,
        avg_turnaround_hours: turnaround.length
          ? Math.round(
              (turnaround.reduce((a, b) => a + b, 0) / turnaround.length) * 10,
            ) / 10
          : 0,
        failure_rate: delivered.length
          ? Math.round((failures / delivered.length) * 10000) / 10000
          : 0,
        new_clients: newClients,
      },
      by_status: ORDER_STATUSES.map((status) => ({
        status,
        count: statusCount.get(status) ?? 0,
      })),
      orders_per_day: [...perDay.values()].map(
        ({ date, created, delivered }) => ({ date, created, delivered }),
      ),
      revenue_per_day: [...perDay.values()].map(({ date, amount }) => ({
        date,
        amount,
      })),
      top_devices: countBy(created, (o) => o.device_type, 10),
      top_brands: countBy(created, (o) => o.brand, 10),
      top_services: [...services.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      technicians: [...technicians.values()].sort(
        (a, b) => b.finished - a.finished,
      ),
      low_stock: lowStock,
      recent_orders: recent.map(serializeOrder),
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query() query: PeriodQueryDto) {
    return this.dashboard.get(query);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
