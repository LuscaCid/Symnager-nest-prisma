import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ROLES, Role } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../common/password';
import { Lowercase, ToBoolean, Trim } from '../common/transforms';
import { USERNAME_MESSAGE, USERNAME_REGEX } from '../auth/auth.dto';

export class CreateUserDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @Lowercase()
  @IsString()
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username: string;
  @Lowercase() @IsEmail() @MaxLength(150) email: string;
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;
  @IsIn(ROLES) role: Role;
  @IsOptional() @Trim() @IsString() @MaxLength(30) phone?: string | null;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateMeDto {
  @IsOptional()
  @Trim(false)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
  @IsOptional() @Lowercase() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional()
  @Lowercase()
  @IsString()
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username?: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() @MaxLength(200) current_password: string;
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  new_password: string;
}

export class UsersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @ToBoolean() @IsBoolean() active?: boolean;
}
