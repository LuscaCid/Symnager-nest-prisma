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
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../common/transforms';
import {
  AllowInternalToken,
  AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '../common/decorators';
import { loadConfig } from '../config/env';
import { CloudAccess } from '../cloud/cloud-access';
import { LicenseService } from './license.service';

export const SKIP_LICENSE_KEY = 'skipLicense';
/** Rota que funciona sem licença válida (health, ativação, backup dos dados do cliente). */
export const SkipLicense = () => SetMetadata(SKIP_LICENSE_KEY, true);

export const CLOUD_OPEN_KEY = 'cloudOpen';
/** Na nuvem, só estas rotas dispensam a licença do cliente (health). */
export const CloudOpen = () => SetMetadata(CLOUD_OPEN_KEY, true);

const isCloud = () => loadConfig().appMode === 'cloud';

/**
 * Primeiro guard depois do rate limit: sem licença válida nenhuma rota responde.
 * 402 + code permite ao frontend abrir a tela de ativação.
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly license: LicenseService,
    private readonly cloud: CloudAccess,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isCloud()) {
      const open = this.reflector.getAllAndOverride<boolean>(CLOUD_OPEN_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!open)
        await this.cloud.authorize(context.switchToHttp().getRequest());
      return true;
    }
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
  @IsOptional()
  @IsIn(['VITALICIO', 'BASICO', 'INTERMEDIARIO', 'PRO'])
  plan?: string;
}

class PlanRequestDto {
  @IsString()
  @IsIn(['VITALICIO', 'BASICO', 'INTERMEDIARIO', 'PRO'])
  plan: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(150) contact?: string;
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

  @Roles('ADMIN')
  @Get('plan-request')
  pendingPlanRequest() {
    return this.license.planRequest(null);
  }

  @Roles('ADMIN')
  @Post('plan-request')
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  planRequest(@Body() dto: PlanRequestDto) {
    return this.license.planRequest({ ...dto });
  }

  /** Token assinado, só para o processo principal do Electron repassar à nuvem. */
  @AllowInternalToken()
  @Get('token')
  token(@CurrentUser() user: AuthUser) {
    if (!user?.internal)
      throw new HttpException(
        { statusCode: 403, message: 'Rota interna.' },
        HttpStatus.FORBIDDEN,
      );
    return { token: this.license.currentToken() };
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
  // Na nuvem a licença vem em cada requisição: as rotas da instalação não existem.
  controllers: isCloud() ? [] : [LicenseController],
  providers: [LicenseService, LicenseGuard, CloudAccess],
  exports: [LicenseService, LicenseGuard, CloudAccess],
})
export class LicenseModule {}
