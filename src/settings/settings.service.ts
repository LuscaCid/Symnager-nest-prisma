import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CustomFieldDef,
  DEFAULT_SEGMENT,
  isSegmentId,
  SegmentId,
  segmentProfile,
} from '../segments/segment-catalog';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/env';
import {
  APP_SIGNATURE,
  DEFAULT_SETTINGS,
  Settings,
  UpdateSettingsDto,
} from './settings.dto';

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
    // Valores gravados por versões antigas ou corrompidos voltam ao padrão.
    const segment = result.segment;
    if (!isSegmentId(segment.id)) segment.id = DEFAULT_SEGMENT;
    if (!Array.isArray(segment.applied)) segment.applied = [];
    if (!Array.isArray(segment.custom_fields)) segment.custom_fields = [];
    return result;
  }

  /** Troca o ramo ativo (chamado só por SegmentsService.apply e pelo setup). */
  async setSegment(id: SegmentId, db: Db = this.prisma) {
    const current = await this.getAll(db);
    const applied = Array.from(new Set([...current.segment.applied, id]));
    const value = JSON.stringify({ ...current.segment, id, applied });
    await db.settings.upsert({
      where: { key: 'segment' },
      create: { key: 'segment', value },
      update: { value },
    });
  }

  /** Merge parcial por seção (company/orders/print). */
  async update(
    dto: UpdateSettingsDto,
    db: Db = this.prisma,
  ): Promise<Settings> {
    const current = await this.getAll(db);
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const patch = dto[key] as Record<string, unknown> | undefined;
      if (!patch) continue;
      if (key === 'segment') {
        // id e applied não mudam por aqui.
        delete patch.id;
        delete patch.applied;
        if (patch.custom_fields)
          patch.custom_fields = this.checkCustomFields(
            current.segment.custom_fields,
            patch.custom_fields as CustomFieldDef[],
          );
      }
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

  /**
   * Campos adicionais: a chave nunca muda nem some (os valores ficam nas OS);
   * para tirar um campo de uso, a empresa o desativa.
   */
  private checkCustomFields(before: CustomFieldDef[], next: CustomFieldDef[]) {
    const keys = new Set<string>();
    for (const field of next) {
      if (keys.has(field.key))
        throw new BadRequestException(`Campo repetido: ${field.key}.`);
      keys.add(field.key);
      if (field.type === 'select' && !field.options?.length)
        throw new BadRequestException(
          `Informe as opções do campo "${field.label}".`,
        );
    }
    for (const old of before) {
      const kept = next.find((f) => f.key === old.key);
      if (!kept)
        throw new BadRequestException(
          `O campo "${old.label}" já foi usado: desative-o em vez de excluir.`,
        );
      if (kept.type !== old.type)
        throw new BadRequestException(
          `Não é possível mudar o tipo do campo "${old.label}".`,
        );
    }
    return next.map((f) => ({ active: true, ...f }));
  }

  /** GET /settings: configurações + perfil do ramo + assinatura do software. */
  async getPublicView() {
    const settings = await this.getAll();
    return {
      ...settings,
      segment_profile: segmentProfile(settings.segment.id),
      app: { ...APP_SIGNATURE, version: loadConfig().version },
    };
  }
}
