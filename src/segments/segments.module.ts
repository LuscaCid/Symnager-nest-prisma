import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { Public, Roles } from '../common/decorators';
import { LOOKUP_KINDS } from '../common/enums';
import { PrismaService } from '../database/prisma.service';
import { lookupSeeds } from '../lookups/lookup-seeds';
import { SettingsService } from '../settings/settings.service';
import {
  isSegmentId,
  SEGMENT_IDS,
  SegmentId,
  SEGMENTS,
} from './segment-catalog';

class ApplySegmentDto {
  @IsIn(SEGMENT_IDS) segment: SegmentId;
  /** Apaga os itens atuais das listas do ramo antes de semear as do novo. */
  @IsOptional() @IsBoolean() replace?: boolean;
}

/** Formas de pagamento valem para qualquer ramo e nunca são apagadas na troca. */
const KEPT_KINDS = new Set(['PAYMENT_METHOD']);
// Mesmo listas que o novo ramo não semeia (ex.: acessórios no ar-condicionado) são limpas.
const replaceableKinds = (_segment: SegmentId) =>
  LOOKUP_KINDS.filter((k) => !KEPT_KINDS.has(k));

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return SEGMENT_IDS.map((id) => {
      const { name, short_name, description, features } = SEGMENTS[id];
      return { id, name, short_name, description, features };
    });
  }

  /** Itens das listas do ramo que ainda não existem neste banco. */
  async missing(
    segment: SegmentId,
    db: Pick<PrismaService, 'lookups'> = this.prisma,
  ) {
    const existing = await db.lookups.findMany({
      select: { kind: true, name: true },
    });
    const have = new Set(
      existing.map((l) => `${l.kind}\u0000${l.name.toLowerCase()}`),
    );
    const add: Record<string, string[]> = {};
    for (const [kind, names] of Object.entries(lookupSeeds(segment))) {
      const missing = names.filter(
        (n) => !have.has(`${kind}\u0000${n.toLowerCase()}`),
      );
      if (missing.length) add[kind] = missing;
    }
    return add;
  }

  /** Quantos itens cada lista tem hoje (o que a opção "apagar" removeria). */
  private async existing(segment: SegmentId) {
    const rows = await this.prisma.lookups.groupBy({
      by: ['kind'],
      where: { kind: { in: replaceableKinds(segment) } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.kind, r._count._all]));
  }

  async preview(segment: string) {
    if (!isSegmentId(segment))
      throw new NotFoundException('Ramo não encontrado.');
    const current = (await this.settings.getAll()).segment.id;
    const seeds = lookupSeeds(segment);
    return {
      from: current,
      to: segment,
      add: await this.missing(segment),
      /** Com "apagar": itens removidos por lista e o que entra no lugar. */
      remove: await this.existing(segment),
      replace_with: Object.fromEntries(
        replaceableKinds(segment).map((k) => [k, seeds[k] ?? []]),
      ),
    };
  }

  /**
   * Troca o ramo. Por padrão só acrescenta o que falta nas listas; com
   * `replace`, apaga os itens atuais (menos formas de pagamento) e deixa
   * só os do novo ramo. As OS guardam o texto, então nada muda nelas.
   */
  async apply(segment: SegmentId, replace = false) {
    const from = (await this.settings.getAll()).segment.id;
    const kinds = replaceableKinds(segment);
    let removed = 0;
    let add: Record<string, string[]> = {};
    await this.prisma.$transaction(async (tx) => {
      if (replace) {
        removed = (
          await tx.lookups.deleteMany({ where: { kind: { in: kinds } } })
        ).count;
      }
      add = await this.missing(segment, tx);
      for (const [kind, names] of Object.entries(add)) {
        const last = await tx.lookups.aggregate({
          where: { kind },
          _max: { sort: true },
        });
        let sort = (last._max.sort ?? -1) + 1;
        for (const name of names) {
          await tx.lookups.upsert({
            where: { kind_name: { kind, name } },
            create: { kind, name, sort: sort++ },
            update: {},
          });
        }
      }
      await this.settings.setSegment(segment, tx);
    });
    const added = Object.values(add).reduce((n, list) => n + list.length, 0);
    await this.audit.log({
      action: replace ? 'SEGMENT_REPLACE' : 'SEGMENT_APPLY',
      entity: 'settings',
      meta: { from, to: segment, added, ...(replace && { removed, kinds }) },
    });
    return { from, to: segment, add, added, removed };
  }
}

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  /** Público: a tela de configuração inicial mostra os ramos antes do login. */
  @Public()
  @Get()
  list() {
    return this.segments.list();
  }

  @Roles('ADMIN')
  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.segments.preview(id);
  }

  @Roles('ADMIN')
  @Post('apply')
  @HttpCode(200)
  apply(@Body() dto: ApplySegmentDto) {
    return this.segments.apply(dto.segment, dto.replace === true);
  }
}

@Module({
  controllers: [SegmentsController],
  providers: [SegmentsService],
})
export class SegmentsModule {}
