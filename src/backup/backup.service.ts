import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import { runMigrations } from '../database/migrator';
import { AuthUser } from '../common/decorators';
import { comparePassword } from '../common/password';
import { USER_SELECT } from '../users/user.select';
import { CsvColumn, toCsv } from './csv';

export const CSV_ENTITIES = [
  'clients',
  'orders',
  'products',
  'services',
  'suppliers',
  'payments',
  'failures',
] as const;
export type CsvEntity = (typeof CSV_ENTITIES)[number];

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

/** YYYYMMDD-HHmm no horário local. */
export function stamp(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger('Backup');
  private readonly config = loadConfig();
  private restoring = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Gera uma cópia consistente do banco com VACUUM INTO e devolve o caminho temporário. */
  async databaseSnapshot(
    action: 'BACKUP_DATABASE' | 'BACKUP_AUTO',
  ): Promise<{ file: string; filename: string }> {
    const file = path.join(
      os.tmpdir(),
      `symnager-backup-${randomBytes(6).toString('hex')}.db`,
    );
    await this.prisma.$executeRawUnsafe(
      `VACUUM INTO '${file.replace(/'/g, "''")}'`,
    );
    await this.audit.log({ action, entity: 'backup' });
    return { file, filename: `symnager-${stamp()}.db` };
  }

  async jsonDump() {
    const p = this.prisma;
    const [
      users,
      clients,
      orders,
      tags,
      order_items,
      payments,
      order_history,
      delivery_failures,
      services,
      products,
      stock_movements,
      suppliers,
      lookups,
      settings,
      audit_logs,
    ] = await Promise.all([
      p.users.findMany({ select: USER_SELECT }),
      p.clients.findMany(),
      p.orders.findMany(),
      p.tags.findMany(),
      p.order_items.findMany(),
      p.payments.findMany(),
      p.order_history.findMany(),
      p.delivery_failures.findMany(),
      p.services.findMany(),
      p.products.findMany(),
      p.stock_movements.findMany(),
      p.suppliers.findMany(),
      p.lookups.findMany(),
      p.settings.findMany(),
      p.audit_logs.findMany(),
    ]);
    await this.audit.log({ action: 'BACKUP_JSON', entity: 'backup' });
    return {
      filename: `symnager-${stamp()}.json`,
      data: {
        exported_at: new Date().toISOString(),
        version: this.config.version,
        tables: {
          users,
          clients,
          orders,
          tags,
          order_items,
          payments,
          order_history,
          delivery_failures,
          services,
          products,
          stock_movements,
          suppliers,
          lookups,
          settings,
          audit_logs,
        },
      },
    };
  }

  async csv(entity: string) {
    if (!CSV_ENTITIES.includes(entity as CsvEntity)) {
      throw new NotFoundException(
        `Entidade inválida. Use: ${CSV_ENTITIES.join(', ')}.`,
      );
    }
    const content = await this.buildCsv(entity as CsvEntity);
    await this.audit.log({
      action: 'EXPORT_CSV',
      entity: 'backup',
      meta: { entity },
    });
    return { filename: `symnager-${entity}-${stamp()}.csv`, content };
  }

  /** Substitui o banco atual pelo enviado, com backup automático e rollback em caso de falha. */
  async restore(
    upload: Express.Multer.File | undefined,
    password: string,
    user: AuthUser,
  ) {
    if (!upload)
      throw new BadRequestException(
        'Envie o arquivo do backup no campo "file".',
      );
    let ownsLock = false;
    try {
      const admin = await this.prisma.users.findUnique({
        where: { user_id: user.user_id },
      });
      if (!admin || !(await comparePassword(password, admin.password))) {
        throw new BadRequestException('Senha incorreta.');
      }
      if (!(await hasSqliteHeader(upload.path))) {
        throw new BadRequestException(
          'O arquivo enviado não é um banco SQLite válido.',
        );
      }
      if (this.restoring)
        throw new BadRequestException(
          'Já existe uma restauração em andamento.',
        );
      this.restoring = ownsLock = true;

      const dbFile = this.config.databaseFile;
      const safety = `${dbFile}.bak-${stamp()}-${randomBytes(3).toString('hex')}`;
      await this.audit.log({
        action: 'RESTORE_START',
        entity: 'backup',
        meta: { safety_copy: path.basename(safety) },
      });

      // Cópia consistente do banco atual antes de qualquer alteração.
      await this.prisma.$executeRawUnsafe(
        `VACUUM INTO '${safety.replace(/'/g, "''")}'`,
      );
      await this.prisma.$disconnect();
      try {
        this.replaceDatabase(upload.path, dbFile);
        await runMigrations(
          process.env.DATABASE_URL,
          this.config.migrationsDir,
        );
        await this.prisma.$connect();
        const admins = await this.prisma.users.count({
          where: { role: 'ADMIN', active: true },
        });
        if (admins === 0)
          throw new Error('o backup não possui nenhum administrador ativo');
      } catch (e) {
        this.logger.error(
          `Restauração falhou, voltando ao banco anterior: ${(e as Error).message}`,
        );
        await this.prisma.$disconnect().catch(() => undefined);
        this.replaceDatabase(safety, dbFile);
        await this.prisma.$connect();
        throw new BadRequestException(
          `Não foi possível restaurar o backup: ${(e as Error).message}.`,
        );
      }

      await this.audit.log({
        action: 'RESTORE',
        entity: 'backup',
        user_id: null,
        meta: {
          by: user.username,
          original_name: upload.originalname,
          safety_copy: path.basename(safety),
        },
      });
      return { ok: true, safety_copy: path.basename(safety) };
    } finally {
      if (ownsLock) this.restoring = false;
      fs.promises.unlink(upload.path).catch(() => undefined);
    }
  }

  private replaceDatabase(source: string, target: string) {
    for (const suffix of ['-journal', '-wal', '-shm']) {
      fs.rmSync(target + suffix, { force: true });
    }
    fs.copyFileSync(source, target);
  }

  private async buildCsv(entity: CsvEntity): Promise<string> {
    const p = this.prisma;
    switch (entity) {
      case 'clients': {
        const rows = await p.clients.findMany({
          where: { deleted_at: null },
          orderBy: { name: 'asc' },
        });
        return toCsv(rows, [
          ['ID', (r) => r.client_id],
          ['Tipo', (r) => r.type],
          ['Nome', (r) => r.name],
          ['CPF/CNPJ', (r) => r.document],
          ['E-mail', (r) => r.email],
          ['Telefone', (r) => r.phone],
          ['Telefone 2', (r) => r.phone2],
          ['CEP', (r) => r.zipcode],
          ['Rua', (r) => r.street],
          ['Número', (r) => r.number],
          ['Complemento', (r) => r.complement],
          ['Bairro', (r) => r.district],
          ['Cidade', (r) => r.city],
          ['UF', (r) => r.state],
          ['Observações', (r) => r.notes],
          ['Criado em', (r) => r.created_at],
        ]);
      }
      case 'orders': {
        const rows = await p.orders.findMany({
          orderBy: { number: 'asc' },
          include: {
            owner: { select: { name: true } },
            technician: { select: { name: true } },
          },
        });
        const cols: CsvColumn<(typeof rows)[number]>[] = [
          ['Número', (r) => r.number],
          ['Rastreio', (r) => r.tracking_code],
          ['Status', (r) => r.status],
          ['Prioridade', (r) => r.priority],
          ['Cliente', (r) => r.owner.name],
          ['Técnico', (r) => r.technician?.name],
          ['Equipamento', (r) => r.device],
          ['Tipo', (r) => r.device_type],
          ['Marca', (r) => r.brand],
          ['Modelo', (r) => r.model],
          ['Série', (r) => r.serial],
          ['Defeito', (r) => r.description],
          ['Diagnóstico', (r) => r.diagnosis],
          ['Solução', (r) => r.solution],
          ['Entrada', (r) => r.arrived_at],
          ['Previsão', (r) => r.due_date],
          ['Concluída', (r) => r.finished_at],
          ['Entregue', (r) => r.delivered_at],
          ['Serviços', (r) => r.total_services],
          ['Produtos', (r) => r.total_products],
          ['Desconto', (r) => r.discount],
          ['Total', (r) => r.total],
          ['Pago', (r) => r.paid],
          ['Garantia até', (r) => r.warranty_until],
        ];
        return toCsv(rows, cols);
      }
      case 'products': {
        const rows = await p.products.findMany({
          orderBy: { name: 'asc' },
          include: { supplier: { select: { name: true } } },
        });
        return toCsv(rows, [
          ['ID', (r) => r.product_id],
          ['SKU', (r) => r.sku],
          ['Nome', (r) => r.name],
          ['Unidade', (r) => r.unit],
          ['Custo', (r) => r.cost_price],
          ['Venda', (r) => r.sale_price],
          ['Estoque', (r) => r.stock],
          ['Estoque mínimo', (r) => r.min_stock],
          ['Fornecedor', (r) => r.supplier?.name],
          ['Ativo', (r) => r.active],
        ]);
      }
      case 'services': {
        const rows = await p.services.findMany({ orderBy: { name: 'asc' } });
        return toCsv(rows, [
          ['ID', (r) => r.service_id],
          ['Nome', (r) => r.name],
          ['Descrição', (r) => r.description],
          ['Preço', (r) => r.price],
          ['Tempo estimado (min)', (r) => r.estimated_minutes],
          ['Garantia (dias)', (r) => r.warranty_days],
          ['Ativo', (r) => r.active],
        ]);
      }
      case 'suppliers': {
        const rows = await p.suppliers.findMany({ orderBy: { name: 'asc' } });
        return toCsv(rows, [
          ['ID', (r) => r.supplier_id],
          ['Nome', (r) => r.name],
          ['CNPJ/CPF', (r) => r.document],
          ['E-mail', (r) => r.email],
          ['Telefone', (r) => r.phone],
          ['Contato', (r) => r.contact],
          ['Observações', (r) => r.notes],
          ['Ativo', (r) => r.active],
        ]);
      }
      case 'payments': {
        const rows = await p.payments.findMany({
          orderBy: { paid_at: 'asc' },
          include: {
            order: {
              select: { number: true, owner: { select: { name: true } } },
            },
            user: { select: { name: true } },
          },
        });
        return toCsv(rows, [
          ['ID', (r) => r.payment_id],
          ['OS', (r) => r.order.number],
          ['Cliente', (r) => r.order.owner.name],
          ['Forma', (r) => r.method],
          ['Valor', (r) => r.amount],
          ['Data', (r) => r.paid_at],
          ['Observações', (r) => r.notes],
          ['Registrado por', (r) => r.user?.name],
        ]);
      }
      case 'failures': {
        const rows = await p.delivery_failures.findMany({
          orderBy: { occurred_at: 'asc' },
          include: {
            order: {
              select: {
                number: true,
                device: true,
                owner: { select: { name: true } },
              },
            },
            technician: { select: { name: true } },
          },
        });
        return toCsv(rows, [
          ['ID', (r) => r.failure_id],
          ['OS', (r) => r.order.number],
          ['Cliente', (r) => r.order.owner.name],
          ['Equipamento', (r) => r.order.device],
          ['Categoria', (r) => r.category],
          ['Motivo', (r) => r.reason],
          ['Descrição', (r) => r.description],
          ['Ocorrência', (r) => r.occurred_at],
          ['Técnico', (r) => r.technician?.name],
          ['Resolvida', (r) => r.resolved],
          ['Resolvida em', (r) => r.resolved_at],
          ['Solução', (r) => r.resolution],
        ]);
      }
    }
  }
}

async function hasSqliteHeader(file: string) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const buffer = Buffer.alloc(SQLITE_HEADER.length);
    await handle.read(buffer, 0, buffer.length, 0);
    return buffer.equals(SQLITE_HEADER);
  } finally {
    await handle.close();
  }
}
