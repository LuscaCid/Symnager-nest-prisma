import { Type } from 'class-transformer';
import {
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
};

export type Settings = typeof DEFAULT_SETTINGS;
