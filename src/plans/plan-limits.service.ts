import {
  Global,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config/env';
import { getRequestContext } from '../common/request-context';
import { PrismaService } from '../database/prisma.service';
import { tenantDir } from '../database/tenant-databases';
import { LicenseService } from '../license/license.service';
import { PlanLimits, planName } from './plans';

export type LimitKind =
  | 'users'
  | 'orders_month'
  | 'storage'
  | 'photos_per_order';

const MB = 1024 * 1024;

const limitError = (limit: LimitKind, message: string) =>
  new HttpException(
    { statusCode: HttpStatus.FORBIDDEN, code: 'PLAN_LIMIT', limit, message },
    HttpStatus.FORBIDDEN,
  );

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else
      total += (await fs.promises.stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/**
 * Limites do plano. Na nuvem valem todos (usuários, OS no mês, espaço e fotos);
 * no banco local só o número de fotos por OS, porque o disco é do cliente.
 */
@Injectable()
export class PlanLimitsService {
  private readonly config = loadConfig();
  private readonly sizes = new Map<string, { bytes: number; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly license: LicenseService,
  ) {}

  private get cloud() {
    return this.config.appMode === 'cloud';
  }

  current(): {
    plan: string | null;
    plan_name: string | null;
    limits: PlanLimits;
  } {
    const tenant = getRequestContext().tenant;
    if (tenant)
      return {
        plan: tenant.plan,
        plan_name: planName(tenant.plan),
        limits: tenant.limits,
      };
    const status = this.license.status();
    return {
      plan: status.plan,
      plan_name: status.plan_name,
      limits: this.license.limits(),
    };
  }

  /** Pasta das fotos: do cliente na nuvem, ao lado do banco no desktop/servidor. */
  photosRoot(): string {
    const tenant = getRequestContext().tenant;
    return tenant
      ? path.join(tenantDir(tenant.id), 'photos')
      : path.join(this.config.dataDir, 'photos');
  }

  private storageRoot(): string {
    const tenant = getRequestContext().tenant;
    return tenant ? tenantDir(tenant.id) : this.config.dataDir;
  }

  /** Espaço usado (banco + fotos), com cache curto: varrer a pasta a cada upload é caro. */
  async storageBytes(fresh = false): Promise<number> {
    const root = this.storageRoot();
    const cached = this.sizes.get(root);
    if (!fresh && cached && Date.now() - cached.at < 60_000)
      return cached.bytes;
    const bytes = this.cloud
      ? await dirSize(root)
      : await dirSize(this.photosRoot());
    this.sizes.set(root, { bytes, at: Date.now() });
    return bytes;
  }

  /** Ajusta o cache depois de gravar/apagar um arquivo. */
  touchStorage(deltaBytes: number) {
    const cached = this.sizes.get(this.storageRoot());
    if (cached) cached.bytes = Math.max(0, cached.bytes + deltaBytes);
  }

  async ordersThisMonth(): Promise<number> {
    return this.prisma.orders.count({
      where: { created_at: { gte: startOfMonth() } },
    });
  }

  async usage() {
    const { plan, plan_name, limits } = this.current();
    const [users, orders_month, storage_bytes] = await Promise.all([
      this.prisma.users.count({ where: { active: true } }),
      this.ordersThisMonth(),
      this.storageBytes(true),
    ]);
    return {
      plan,
      plan_name,
      limits,
      usage: { users, orders_month, storage_bytes },
    };
  }

  async assertCanAddUser() {
    if (!this.cloud) return;
    const { limits, plan_name } = this.current();
    if (limits.max_users === null) return;
    const active = await this.prisma.users.count({ where: { active: true } });
    if (active >= limits.max_users)
      throw limitError(
        'users',
        `O plano ${plan_name} permite até ${limits.max_users} usuário(s) ativo(s). Desative alguém ou mude de plano.`,
      );
  }

  async assertCanCreateOrder() {
    if (!this.cloud) return;
    const { limits, plan_name } = this.current();
    await this.assertStorage(0);
    if (limits.max_orders_month === null) return;
    if ((await this.ordersThisMonth()) >= limits.max_orders_month)
      throw limitError(
        'orders_month',
        `O plano ${plan_name} permite ${limits.max_orders_month} ordens de serviço por mês e esse limite foi atingido. Ele volta no dia 1º, ou mude de plano.`,
      );
  }

  async assertStorage(extraBytes: number) {
    if (!this.cloud) return;
    const { limits, plan_name } = this.current();
    if (limits.storage_mb === null) return;
    const used = await this.storageBytes();
    if (used + extraBytes > limits.storage_mb * MB)
      throw limitError(
        'storage',
        `O espaço do plano ${plan_name} (${formatMb(limits.storage_mb)}) acabou. Apague fotos antigas ou mude de plano.`,
      );
  }

  async assertPhotos(orderId: number) {
    const { limits, plan_name } = this.current();
    const count = await this.prisma.order_photos.count({
      where: { order_id: orderId },
    });
    if (count >= limits.max_photos_per_order)
      throw limitError(
        'photos_per_order',
        `O plano ${plan_name ?? 'atual'} permite ${limits.max_photos_per_order} fotos por OS.`,
      );
  }
}

const formatMb = (mb: number) =>
  mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;

@Global()
@Module({
  providers: [PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlansModule {}
