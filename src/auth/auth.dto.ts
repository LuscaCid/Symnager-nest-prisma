import {
  IsIn,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../common/password';
import { Lowercase, Trim } from '../common/transforms';
import { SEGMENT_IDS, SegmentId } from '../segments/segment-catalog';

export const USERNAME_REGEX = /^[a-z0-9._-]{3,40}$/;
export const USERNAME_MESSAGE =
  'username deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';

export class SetupDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @Lowercase()
  @IsString()
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username: string;
  @Lowercase() @IsEmail() @MaxLength(150) email: string;
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
  @IsOptional() @Trim() @IsString() @MaxLength(150) company_name?: string;
  /** Ramo de atuação; sem ele vale o padrão do instalador (DEFAULT_SEGMENT). */
  @IsOptional() @IsIn(SEGMENT_IDS) segment?: SegmentId;
}

export class LoginDto {
  @Lowercase() @IsString() @IsNotEmpty() @MaxLength(150) login: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}

export class RefreshDto {
  @IsOptional() @IsString() @MaxLength(256) refresh_token?: string;
}
