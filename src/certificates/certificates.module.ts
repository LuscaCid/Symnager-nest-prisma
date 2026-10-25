import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../common/decorators';
import { paginate, PaginationQueryDto } from '../common/pagination';
import { Trim } from '../common/transforms';
import { PrismaService } from '../database/prisma.service';
import { generateTrackingCode } from '../orders/order.include';
import {
  CERTIFICATE_TYPES,
  CertificateType,
  PMOC_DISCLAIMER,
  segmentProfile,
  SEGMENTS,
} from '../segments/segment-catalog';
import { SettingsService } from '../settings/settings.service';

// ---------------------------------------------------------------- DTOs

class EquipmentDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(200) device: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) device_type?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) serial?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(30) btu?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(30) gas?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(30) tensao?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) ambiente?: string;
}

class CertChecklistDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(120) item: string;
  @ValidateIf((_o, v) => v !== null) @IsBoolean() ok: boolean | null;
  @IsOptional() @Trim() @IsString() @MaxLength(200) note?: string;
}

class ProductDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) registry?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) batch?: string;
}

class MeasurementsDto {
  @IsOptional() @IsNumber() pressure_psi?: number;
  @IsOptional() @IsNumber() current_a?: number;
  @IsOptional() @IsNumber() voltage_v?: number;
  @IsOptional() @IsNumber() supply_c?: number;
  @IsOptional() @IsNumber() return_c?: number;
}

class CreateCertificateDto {
  @IsIn(CERTIFICATE_TYPES) type: CertificateType;
  @IsOptional() @IsISO8601() performed_at?: string;
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  next_service_at?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(120) technician_name?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) technician_registry?: string;
  @IsArray()
  @ArrayMinSize(1, { message: 'Informe pelo menos um equipamento.' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => EquipmentDto)
  equipment: EquipmentDto[];
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CertChecklistDto)
  checklist: CertChecklistDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  products?: ProductDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => MeasurementsDto)
  measurements?: MeasurementsDto;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) notes?: string;
}

class CancelCertificateDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
}

class CertificatesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsISO8601() due_from?: string;
  @IsOptional() @IsISO8601() due_to?: string;
  @IsOptional() @IsIn(CERTIFICATE_TYPES) type?: CertificateType;
  @IsOptional() @IsIn(['VALIDO', 'CANCELADO']) status?: string;
}

// ---------------------------------------------------------------- serviço

type Row = Prisma.certificatesGetPayload<{
  include: {
    order: { select: { number: true } };
    issued_by: { select: { user_id: true; name: true } };
  };
}>;

const INCLUDE = {
  order: { select: { number: true } },
  issued_by: { select: { user_id: true, name: true } },
} as const;

const json = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/** Modelo do tipo (vale mesmo se a empresa trocou de ramo depois de emitir). */
const templateFor = (type: string) =>
  Object.values(SEGMENTS)
    .map((s) => s.certificate_templates[type as CertificateType])
    .find(Boolean);

const pad = (n: number) => String(n).padStart(6, '0');

const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/** "João Silva" -> "Jo** S****": o link de verificação é público. */
const maskName = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) =>
      i === 0
        ? w.slice(0, 2) + '*'.repeat(Math.max(0, w.length - 2))
        : w[0] + '*'.repeat(w.length - 1),
    )
    .join(' ');

function clientAddress(c: {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
}) {
  const line1 = [c.street, c.number].filter(Boolean).join(', ');
  const parts = [
    [line1, c.complement].filter(Boolean).join(' – '),
    c.district,
    [c.city, c.state].filter(Boolean).join('/'),
    c.zipcode ? `CEP ${c.zipcode}` : null,
  ];
  return parts.filter(Boolean).join(', ');
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private serialize(row: Row, prefix: string) {
    const template = templateFor(row.type);
    return {
      id: row.certificate_id,
      number: row.number,
      code: `${prefix}-${pad(row.number)}`,
      type: row.type,
      title: template?.title ?? 'Certificado',
      verification_code: row.verification_code,
      status: row.status,
      order_id: row.order_id,
      order_number: row.order.number,
      performed_at: row.performed_at,
      next_service_at: row.next_service_at,
      technician_name: row.technician_name,
      technician_registry: row.technician_registry,
      equipment: json(row.equipment, [] as Record<string, string>[]),
      checklist: json(row.checklist, [] as unknown[]),
      products: json(row.products, [] as unknown[]),
      measurements: json(
        row.measurements,
        null as Record<string, number> | null,
      ),
      notes: row.notes,
      client: json(row.client_snapshot, {} as Record<string, string>),
      company: json(row.company_snapshot, {} as Record<string, string>),
      issued_by: row.issued_by
        ? { id: row.issued_by.user_id, name: row.issued_by.name }
        : null,
      disclaimer: template?.disclaimer ? PMOC_DISCLAIMER : null,
      canceled_at: row.canceled_at,
      cancel_reason: row.cancel_reason,
      created_at: row.created_at,
    };
  }

  private async prefix() {
    return (await this.settings.getAll()).certificates.prefix || 'CERT';
  }

  async listForOrder(orderId: number) {
    const rows = await this.prisma.certificates.findMany({
      where: { order_id: orderId },
      include: INCLUDE,
      orderBy: { number: 'desc' },
    });
    const prefix = await this.prefix();
    return rows.map((r) => this.serialize(r, prefix));
  }

  async findById(id: number) {
    const row = await this.prisma.certificates.findUnique({
      where: { certificate_id: id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    return this.serialize(row, await this.prefix());
  }

  async create(orderId: number, dto: CreateCertificateDto, user: AuthUser) {
    const settings = await this.settings.getAll();
    const profile = segmentProfile(settings.segment.id);
    if (!profile.features.certificates.includes(dto.type))
      throw new BadRequestException(
        'Certificados estão disponíveis só no ramo de ar-condicionado e refrigeração.',
      );
    const order = await this.prisma.orders.findUnique({
      where: { order_id: orderId },
      include: { owner: true, technician: { select: { name: true } } },
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
    if (order.status === 'CANCELADA')
      throw new BadRequestException(
        'Não é possível emitir certificado de OS cancelada.',
      );

    const template = profile.certificate_templates[dto.type];
    const performed = dto.performed_at
      ? new Date(dto.performed_at)
      : new Date();
    const months = template
      ? settings.certificates[template.months_setting]
      : settings.certificates.hygiene_months;
    const next =
      dto.next_service_at === undefined
        ? addMonths(performed, months)
        : dto.next_service_at
          ? new Date(dto.next_service_at)
          : null;
    const technician =
      dto.technician_name ||
      order.technician?.name ||
      settings.certificates.responsible_name ||
      user.name;
    const company = settings.company;
    const c = order.owner;

    const id = await this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const last = await tx.certificates.aggregate({
          _max: { number: true },
        });
        const created = await tx.certificates.create({
          data: {
            number: (last._max.number ?? 0) + 1,
            type: dto.type,
            verification_code: generateTrackingCode(10),
            order_id: orderId,
            issued_by_id: user.user_id,
            performed_at: performed,
            next_service_at: next,
            technician_name: technician,
            technician_registry:
              dto.technician_registry ||
              settings.certificates.responsible_registry ||
              null,
            equipment: JSON.stringify(dto.equipment),
            checklist: JSON.stringify(dto.checklist),
            products: dto.products?.length
              ? JSON.stringify(dto.products)
              : null,
            measurements:
              dto.measurements && Object.keys(dto.measurements).length
                ? JSON.stringify(dto.measurements)
                : null,
            notes: dto.notes || null,
            client_snapshot: JSON.stringify({
              name: c.name,
              document: c.document,
              phone: c.phone,
              address: order.service_address || clientAddress(c),
            }),
            company_snapshot: JSON.stringify({
              name: company.name,
              document: company.document,
              phone: company.phone,
              email: company.email,
              address: [company.address, company.city, company.state]
                .filter(Boolean)
                .join(', '),
            }),
          },
        });
        await tx.order_history.create({
          data: {
            order_id: orderId,
            user_id: user.user_id,
            type: 'CERTIFICATE',
            message: `${template?.title ?? 'Certificado'} nº ${pad(created.number)} emitido.`,
          },
        });
        return created.certificate_id;
      }),
    );
    await this.audit.log({
      action: 'CERTIFICATE_ISSUE',
      entity: 'certificates',
      entity_id: id,
      meta: { order_id: orderId, type: dto.type },
    });
    return this.findById(id);
  }

  async cancel(id: number, reason: string, user: AuthUser) {
    const row = await this.prisma.certificates.findUnique({
      where: { certificate_id: id },
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    if (row.status === 'CANCELADO')
      throw new BadRequestException('Certificado já cancelado.');
    await this.prisma.$transaction([
      this.prisma.certificates.update({
        where: { certificate_id: id },
        data: {
          status: 'CANCELADO',
          canceled_at: new Date(),
          cancel_reason: reason,
        },
      }),
      this.prisma.order_history.create({
        data: {
          order_id: row.order_id,
          user_id: user.user_id,
          type: 'CERTIFICATE',
          message: `Certificado nº ${pad(row.number)} cancelado: ${reason}`,
        },
      }),
    ]);
    await this.audit.log({
      action: 'CERTIFICATE_CANCEL',
      entity: 'certificates',
      entity_id: id,
      meta: { reason },
    });
    return this.findById(id);
  }

  /** Próximas manutenções (receita recorrente): filtra pela próxima data. */
  async list(query: CertificatesQueryDto) {
    const where: Prisma.certificatesWhereInput = {
      ...(query.type && { type: query.type }),
      status: query.status ?? 'VALIDO',
      ...((query.due_from || query.due_to) && {
        next_service_at: {
          ...(query.due_from && { gte: new Date(query.due_from) }),
          ...(query.due_to && { lte: new Date(query.due_to) }),
        },
      }),
    };
    const prefix = await this.prefix();
    const result = await paginate(
      query,
      () => this.prisma.certificates.count({ where }),
      (page) =>
        this.prisma.certificates.findMany({
          where,
          ...page,
          include: INCLUDE,
          orderBy: { next_service_at: 'asc' },
        }),
    );
    return {
      ...result,
      data: result.data.map((r) => this.serialize(r, prefix)),
    };
  }

  async verify(code: string) {
    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(normalized))
      throw new NotFoundException('Certificado não encontrado.');
    const row = await this.prisma.certificates.findUnique({
      where: { verification_code: normalized },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    const cert = this.serialize(row, await this.prefix());
    const { company } = await this.settings.getAll();
    return {
      number: cert.number,
      code: cert.code,
      type: cert.type,
      title: cert.title,
      status: cert.status,
      performed_at: cert.performed_at,
      next_service_at: cert.next_service_at,
      company: { name: company.name, phone: company.phone },
      client_name: maskName(cert.client.name ?? ''),
      equipment: cert.equipment.map((e) => ({
        device: e.device,
        device_type: e.device_type,
        btu: e.btu,
        ambiente: e.ambiente,
      })),
    };
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (e) {
        const conflict =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002';
        if (!conflict || i >= attempts) throw e;
      }
    }
  }
}

// ---------------------------------------------------------------- rotas

@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('orders/:id/certificates')
  listForOrder(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.listForOrder(id);
  }

  @Post('orders/:id/certificates')
  @Roles('TECNICO')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.certificates.create(id, dto, user);
  }

  @Get('certificates')
  list(@Query() query: CertificatesQueryDto) {
    return this.certificates.list(query);
  }

  @Get('certificates/:id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.findById(id);
  }

  @Post('certificates/:id/cancel')
  @Roles('ADMIN')
  @HttpCode(200)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.certificates.cancel(id, dto.reason, user);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/certificates/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }
}

@Module({
  controllers: [CertificatesController],
  providers: [CertificatesService],
})
export class CertificatesModule {}
