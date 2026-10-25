import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { STOCK_MOVEMENT_TYPES } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import { DigitsOnly, Lowercase, ToBoolean, Trim } from '../common/transforms';

const MONEY = { maxDecimalPlaces: 2 };

// ---------------------------------------------------------------- serviços

export class CreateServiceDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?:
    | string
    | null;
  @IsNumber(MONEY) @Min(0) price: number;
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  estimated_minutes?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(3650) warranty_days?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateServiceDto extends PartialType(CreateServiceDto) {}

// ---------------------------------------------------------------- produtos

export class CreateProductDto {
  @IsOptional() @Trim() @IsString() @MaxLength(60) sku?: string | null;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?:
    | string
    | null;
  @IsOptional() @Trim(false) @IsString() @MaxLength(10) unit?: string;
  @IsOptional() @IsNumber(MONEY) @Min(0) cost_price?: number;
  @IsNumber(MONEY) @Min(0) sale_price: number;
  /** Estoque inicial (gera movimento IN). Depois disso, use POST /products/:id/stock. */
  @IsOptional() @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsInt() @Min(0) min_stock?: number;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() supplier_id?:
    | number
    | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class StockMovementDto {
  @IsIn(STOCK_MOVEMENT_TYPES) type: (typeof STOCK_MOVEMENT_TYPES)[number];
  /** IN/OUT: quantidade movimentada. ADJUST: novo saldo. */
  @IsInt() @Min(0) @Max(1_000_000) quantity: number;
  @IsOptional() @Trim() @IsString() @MaxLength(300) reason?: string | null;
}

export class ProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @ToBoolean() @IsBoolean() active?: boolean;
  @IsOptional() @ToBoolean() @IsBoolean() low_stock?: boolean;
}

// ------------------------------------------------------------- fornecedores

export class CreateSupplierDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsOptional() @DigitsOnly() @IsString() @MaxLength(14) document?:
    | string
    | null;
  @IsOptional()
  @Lowercase()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  @MaxLength(150)
  email?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) contact?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class ActiveQueryDto extends PaginationQueryDto {
  @IsOptional() @ToBoolean() @IsBoolean() active?: boolean;
}
