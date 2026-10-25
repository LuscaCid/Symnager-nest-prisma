import {
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { Public } from '../common/decorators';

@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Consulta pública pelo código de rastreio: só dados não sensíveis. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('track/:code')
  async track(@Param('code') code: string) {
    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(normalized))
      throw new NotFoundException('OS não encontrada.');
    const order = await this.prisma.orders.findUnique({
      where: { tracking_code: normalized },
      select: {
        number: true,
        status: true,
        device: true,
        arrived_at: true,
        finished_at: true,
        delivered_at: true,
      },
    });
    if (!order) throw new NotFoundException('OS não encontrada.');
    const { company } = await this.settings.getAll();
    return { ...order, company: { name: company.name, phone: company.phone } };
  }
}

@Module({ controllers: [PublicController] })
export class PublicModule {}
