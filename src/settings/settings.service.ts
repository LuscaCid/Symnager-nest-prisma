import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_SETTINGS, Settings, UpdateSettingsDto } from './settings.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Configurações completas (padrões + valores gravados). */
  async getAll(db: Db = this.prisma): Promise<Settings> {
    const rows = await db.settings.findMany();
    const result = structuredClone(DEFAULT_SETTINGS);
    for (const row of rows) {
      if (!(row.key in result)) continue;
      try {
        Object.assign(result[row.key as keyof Settings], JSON.parse(row.value));
      } catch {
        // valor corrompido: mantém o padrão
      }
    }
    return result;
  }

  /** Merge parcial por seção (company/orders/print). */
  async update(
    dto: UpdateSettingsDto,
    db: Db = this.prisma,
  ): Promise<Settings> {
    const current = await this.getAll(db);
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const patch = dto[key];
      if (!patch) continue;
      const value = JSON.stringify({ ...current[key], ...patch });
      await db.settings.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    const sections = Object.keys(dto).filter(
      (k) => dto[k as keyof UpdateSettingsDto],
    );
    if (sections.length && db === this.prisma) {
      await this.audit.log({
        action: 'SETTINGS_UPDATE',
        entity: 'settings',
        meta: { sections },
      });
    }
    return this.getAll(db);
  }
}
