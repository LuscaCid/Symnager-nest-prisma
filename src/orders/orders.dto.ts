import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ITEM_KINDS,
  ItemKind,
  ORDER_STATUSES,
  OrderStatus,
  PRIORITIES,
  Priority,
} from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import { CsvToArray, ToBoolean, Trim } from '../common/transforms';

/** Item do checklist de entrada; `ok` null = não verificado. */
export class ChecklistItemDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(80) item: string;
  @ValidateIf((_o, v) => v !== null) @IsBoolean() ok: boolean | null;
  @IsOptional() @Trim() @IsString() @MaxLength(200) note?: string | null;
}

const MONEY = { maxDecimalPlaces: 2 };

export class ItemInputDto {
  @IsIn(ITEM_KINDS) kind: ItemKind;
  @IsOptional() @IsInt() service_id?: number | null;
  @IsOptional() @IsInt() product_id?: number | null;
  @IsOptional() @Trim() @IsString() @MaxLength(300) description?: string | null;
  @IsInt() @Min(1) @Max(100000) quantity: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) unit_price?: number;
}

export class UpdateItemDto {
  @IsOptional()
  @Trim(false)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) quantity?: number;
  @IsOptional() @IsNumber(MONEY) @Min(0) unit_price?: number;
}

export class CreateOrderDto {
  @IsInt() owner_id: number;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(200) device: string;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(5000) description: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) device_type?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) brand?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) model?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) serial?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) accessories?:
    | string
    | null;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) condition?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) device_password?:
    | string
    | null;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() technician_id?:
    | number
    | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601() due_date?:
    | string
    | null;
  @IsOptional() @IsInt() @Min(0) @Max(3650) warranty_days?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) diagnosis?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) solution?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) internal_notes?:
    | string
    | null;
  @IsOptional() @IsNumber(MONEY) @Min(0) discount?: number;
  @IsOptional() @IsISO8601() arrived_at?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[] | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ItemInputDto)
  items?: ItemInputDto[];
}

/** Campos editáveis da OS (sem status/totais/itens). */
export class UpdateOrderDto extends PartialType(
  OmitType(CreateOrderDto, ['items'] as const),
) {}

export class UpdateStatusDto {
  @IsIn(ORDER_STATUSES) status: OrderStatus;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) message?: string | null;
}

export class CreatePaymentDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(60) method: string;
  @IsNumber(MONEY) @IsPositive() amount: number;
  @IsOptional() @IsISO8601() paid_at?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(500) notes?: string | null;
}

export class CommentDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(5000) message: string;
}

export class PrintDto {
  @IsIn(['A4', 'THERMAL']) layout: 'A4' | 'THERMAL';
}

export class OrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @CsvToArray()
  @IsIn(ORDER_STATUSES, { each: true })
  status?: OrderStatus[];
  @IsOptional()
  @CsvToArray()
  @IsIn(PRIORITIES, { each: true })
  priority?: Priority[];
  @IsOptional() @Type(() => Number) @IsInt() technician_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() owner_id?: number;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @ToBoolean() @IsBoolean() overdue?: boolean;
  @IsOptional() @IsString() @MaxLength(40) tag?: string;
}
