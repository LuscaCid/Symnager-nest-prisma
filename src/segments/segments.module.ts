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
import { IsIn } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { Public, Roles } from '../common/decorators';
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
}

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
  async missing(segment: SegmentId) {
    const existing = await this.prisma.lookups.findMany({
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

  async preview(segment: string) {
    if (!isSegmentId(segment))
      throw new NotFoundException('Ramo não encontrado.');
    const current = (await this.settings.getAll()).segment.id;
    return { from: current, to: segment, add: await this.missing(segment) };
  }

  /** Troca o ramo: só acrescenta o que falta nas listas, nunca apaga nem desativa. */
  async apply(segment: SegmentId) {
    const from = (await this.settings.getAll()).segment.id;
    const add = await this.missing(segment);
    await this.prisma.$transaction(async (tx) => {
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
      action: 'SEGMENT_APPLY',
      entity: 'settings',
      meta: { from, to: segment, added },
    });
    return { from, to: segment, add, added };
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
    return this.segments.apply(dto.segment);
  }
}

@Module({
  controllers: [SegmentsController],
  providers: [SegmentsService],
})
export class SegmentsModule {}
