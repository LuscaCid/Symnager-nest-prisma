import { PartialType } from '@nestjs/mapped-types';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CLIENT_TYPES } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import { DigitsOnly, Lowercase, ToBoolean, Trim } from '../common/transforms';
import { IsBoolean } from 'class-validator';

export class CreateClientDto {
  @IsOptional() @IsIn(CLIENT_TYPES) type?: 'PF' | 'PJ';
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(150) name: string;

  @IsOptional()
  @DigitsOnly()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^(\d{11}|\d{14})$/, {
    message: 'document deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos).',
  })
  document?: string | null;

  @IsOptional()
  @Lowercase()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(30) phone: string;
  @IsOptional() @Trim() @IsString() @MaxLength(30) phone2?: string | null;

  @IsOptional()
  @DigitsOnly()
  @ValidateIf((_o, v) => v !== null)
  @Length(8, 8, { message: 'zipcode deve ter 8 dígitos.' })
  zipcode?: string | null;

  @IsOptional() @Trim() @IsString() @MaxLength(200) street?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(20) number?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) complement?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) district?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(2) state?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) notes?: string | null;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ForceQueryDto {
  @IsOptional() @ToBoolean() @IsBoolean() force?: boolean;
}

export class ClientsQueryDto extends PaginationQueryDto {
  @IsOptional() @ToBoolean() @IsBoolean() include_deleted?: boolean;
  @IsOptional() @IsIn(CLIENT_TYPES) type?: 'PF' | 'PJ';
}
