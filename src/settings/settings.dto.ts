import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ORDER_STATUSES, OrderStatus } from '../common/enums';
import {
  CustomFieldDef,
  DEFAULT_SEGMENT,
  SegmentId,
} from '../segments/segment-catalog';

export const MAX_CUSTOM_FIELDS = 6;
export const MAX_BOARD_COLUMNS = 20;

export interface BoardColumn {
  /** Identificador estável (gravado em orders.board_column). */
  key: string;
  /** Vazio = nome do status no ramo atual. */
  label: string;
  /** #rrggbb; vazio = cor padrão do status. */
  color: string;
  /** Status do sistema que a OS recebe ao entrar na coluna. */
  status: OrderStatus;
}

/** Uma coluna por status, na ordem do fluxo (o quadro de antes). */
export const DEFAULT_BOARD_COLUMNS: BoardColumn[] = ORDER_STATUSES.map(
  (status) => ({ key: status.toLowerCase(), label: '', color: '', status }),
);

// Data URL de imagem com até ~300 KB de conteúdo (base64 ≈ 4/3 do tamanho).
const LOGO_MAX_CHARS = 410_000;

class CompanySettingsDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(2) state?: string;
  @IsOptional() @IsString() @MaxLength(10) zipcode?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsString()
  @Matches(/^data:image\/(png|jpe?g|webp|svg\+xml);base64,/, {
    message:
      'company.logo deve ser uma imagem em data URL (png, jpg, webp ou svg).',
  })
  @MaxLength(LOGO_MAX_CHARS, {
    message: 'company.logo deve ter no máximo 300 KB.',
  })
  logo?: string | null;
}

class OrderSettingsDto {
  @IsOptional() @IsString() @MaxLength(10) prefix?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3650) default_warranty_days?: number;
  @IsOptional() @IsString() @MaxLength(5000) terms?: string;
  @IsOptional() @IsBoolean() require_technician?: boolean;

  /** URL pública da página de rastreio (usada no QR code do comprovante). */
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsString()
  @Matches(/^https?:\/\/\S+$/, {
    message: 'orders.public_url deve começar com http:// ou https://.',
  })
  @MaxLength(300)
  public_url?: string;
}

class CustomFieldDto {
  @IsString()
  @Matches(/^cf_[a-z0-9_]{1,27}$/, {
    message:
      'A chave do campo deve começar com cf_ e ter letras minúsculas, números ou _.',
  })
  key: string;
  @IsString() @MaxLength(40) label: string;
  @IsIn(['text', 'number', 'select', 'date', 'boolean'])
  type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  options?: string[];
  @IsOptional() @IsString() @MaxLength(15) unit?: string;
  @IsOptional() @IsBoolean() show_on_reception?: boolean;
  @IsOptional() @IsBoolean() show_on_print?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** O ramo (id) só muda por POST /segments/apply, que também semeia as listas. */
class SegmentSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CUSTOM_FIELDS, {
    message: `Use no máximo ${MAX_CUSTOM_FIELDS} campos adicionais.`,
  })
  @ValidateNested({ each: true })
  @Type(() => CustomFieldDto)
  custom_fields?: CustomFieldDto[];
  /** null = padrão do ramo. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsBoolean()
  on_site?: boolean | null;
}

class CertificateSettingsDto {
  @IsOptional() @IsString() @MaxLength(10) prefix?: string;
  @IsOptional() @IsString() @MaxLength(120) responsible_name?: string;
  @IsOptional() @IsString() @MaxLength(60) responsible_registry?: string;
  @IsOptional() @IsInt() @Min(1) @Max(36) hygiene_months?: number;
  @IsOptional() @IsInt() @Min(1) @Max(36) preventive_months?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() show_qrcode?: boolean;
}

class BoardColumnDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,30}$/, {
    message: 'A chave da coluna deve ter letras minúsculas, números ou _.',
  })
  key: string;
  @IsString() @MaxLength(40) label: string;
  @IsString()
  @Matches(/^(#[0-9a-fA-F]{6})?$/, { message: 'Cor inválida.' })
  color: string;
  @IsIn(ORDER_STATUSES) status: OrderStatus;
}

class BoardSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'O quadro precisa de pelo menos uma coluna.' })
  @ArrayMaxSize(MAX_BOARD_COLUMNS, {
    message: `Use no máximo ${MAX_BOARD_COLUMNS} colunas.`,
  })
  @ValidateNested({ each: true })
  @Type(() => BoardColumnDto)
  columns?: BoardColumnDto[];
}

class PrintSettingsDto {
  @IsOptional() @IsIn(['A4', 'THERMAL']) layout?: 'A4' | 'THERMAL';
  @IsOptional() @IsInt() @Min(1) @Max(5) copies?: number;
  @IsOptional() @IsBoolean() show_qrcode?: boolean;
  @IsOptional() @IsBoolean() show_prices?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanySettingsDto)
  company?: CompanySettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderSettingsDto)
  orders?: OrderSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => PrintSettingsDto)
  print?: PrintSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentSettingsDto)
  segment?: SegmentSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => CertificateSettingsDto)
  certificates?: CertificateSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => BoardSettingsDto)
  board?: BoardSettingsDto;
}

export const DEFAULT_SETTINGS = {
  company: {
    name: '',
    document: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    logo: null as string | null,
  },
  orders: {
    prefix: 'OS',
    default_warranty_days: 90,
    terms: '',
    require_technician: false,
    public_url: '',
  },
  print: {
    layout: 'A4' as 'A4' | 'THERMAL',
    copies: 1,
    show_qrcode: true,
    show_prices: true,
  },
  segment: {
    id: DEFAULT_SEGMENT as SegmentId,
    /** Ramos cujas listas já foram aplicadas. */
    applied: [] as SegmentId[],
    custom_fields: [] as CustomFieldDef[],
    on_site: null as boolean | null,
  },
  certificates: {
    prefix: 'CERT',
    responsible_name: '',
    responsible_registry: '',
    hygiene_months: 6,
    preventive_months: 3,
    /** Texto livre impresso no rodapé dos certificados. */
    notes: '',
    show_qrcode: true,
  },
  board: {
    columns: DEFAULT_BOARD_COLUMNS,
  },
};

export type Settings = typeof DEFAULT_SETTINGS;

/** Assinatura do software (somente leitura, não é gravada em settings). */
export const APP_SIGNATURE = {
  name: 'Symnager',
  developer: 'Lucidev',
} as const;
