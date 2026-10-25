import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FAILURE_CATEGORIES } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import { ToBoolean, Trim } from '../common/transforms';

type Category = (typeof FAILURE_CATEGORIES)[number];

export class CreateFailureDto {
  @IsIn(FAILURE_CATEGORIES) category: Category;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(200) reason: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) description?:
    | string
    | null;
  @IsOptional() @IsISO8601() occurred_at?: string;
}

export class UpdateFailureDto {
  @IsOptional() @IsIn(FAILURE_CATEGORIES) category?: Category;
  @IsOptional()
  @Trim(false)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) description?:
    | string
    | null;
  @IsOptional() @IsISO8601() occurred_at?: string;
  @IsOptional() @IsBoolean() resolved?: boolean;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) resolution?: string | null;
}

export class FailuresQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(FAILURE_CATEGORIES) category?: Category;
  @IsOptional() @ToBoolean() @IsBoolean() resolved?: boolean;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() technician_id?: number;
}

export class PeriodQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
