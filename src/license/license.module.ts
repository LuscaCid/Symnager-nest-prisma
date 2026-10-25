import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Global,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Module,
  Post,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../common/transforms';
import { Public, Roles } from '../common/decorators';
import { LicenseService } from './license.service';

export const SKIP_LICENSE_KEY = 'skipLicense';
/** Rota que funciona sem licença válida (health, ativação, backup dos dados do cliente). */
export const SkipLicense = () => SetMetadata(SKIP_LICENSE_KEY, true);

/**
 * Primeiro guard depois do rate limit: sem licença válida nenhuma rota responde.
 * 402 + code permite ao frontend abrir a tela de ativação.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly license: LicenseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LICENSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;
    const { valid, status, message } = this.license.evaluate();
    if (valid) return true;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'LICENSE_REQUIRED',
        license_status: status,
        message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

class ActivateLicenseDto {
  @IsString() @IsNotEmpty() @MaxLength(40) key: string;
}

class LicenseRequestDto {
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(150) company_name: string;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(120) contact_name: string;
  @IsOptional() @Trim() @IsString() @MaxLength(20) document?: string;
  @Trim(false) @IsEmail() @MaxLength(150) email: string;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(30) phone: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) message?: string;
}

@SkipLicense()
@Controller('license')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  @Public()
  @Get()
  status() {
    return this.license.status();
  }

  @Public()
  @Post('activate')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  activate(@Body() dto: ActivateLicenseDto) {
    return this.license.activate(dto.key);
  }

  /** "Verificar agora": check-in imediato (ex.: depois de o suporte desbloquear). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  async refresh() {
    await this.license.refreshIfDue(true);
    return this.license.status();
  }

  /** "Ainda não tenho licença": cria o pedido no painel (status PENDING). */
  @Public()
  @Post('request')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  request(@Body() dto: LicenseRequestDto) {
    return this.license.request({ ...dto });
  }

  /** Libera a vaga deste computador (trocar de máquina). */
  @Roles('ADMIN')
  @Delete()
  deactivate() {
    return this.license.deactivate();
  }
}

@Global()
@Module({
  controllers: [LicenseController],
  providers: [LicenseService, LicenseGuard],
  exports: [LicenseService, LicenseGuard],
})
export class LicenseModule {}
