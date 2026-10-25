import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { loadConfig } from '../config/env';
import { Public } from '../common/decorators';
import { APP_SIGNATURE } from '../settings/settings.dto';
import { CloudOpen, SkipLicense } from '../license/license.module';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipLicense()
  @CloudOpen()
  @SkipThrottle()
  @Get()
  async check() {
    const config = loadConfig();
    let db = 'ok';
    try {
      if (config.appMode !== 'cloud')
        await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      version: config.version,
      developer: APP_SIGNATURE.developer,
      db,
      mode: config.appMode,
      time: new Date().toISOString(),
    };
  }
}
