import { Controller, Get, Module, NotFoundException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { getRequestContext } from '../common/request-context';
import { loadConfig } from '../config/env';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { planName } from '../plans/plans';

@Controller('cloud')
export class CloudController {
  constructor(private readonly limits: PlanLimitsService) {}

  private tenant() {
    const tenant = getRequestContext().tenant;
    if (loadConfig().appMode !== 'cloud' || !tenant)
      throw new NotFoundException();
    return tenant;
  }

  /** Teste de conexão do app: só a licença (o guard já recusou planos sem nuvem). */
  @Public()
  @Get('check')
  check() {
    const tenant = this.tenant();
    return {
      ok: true,
      tenant: { id: tenant.id, name: tenant.name },
      plan: tenant.plan,
      plan_name: planName(tenant.plan),
      limits: tenant.limits,
    };
  }

  @Get('usage')
  usage() {
    this.tenant();
    return this.limits.usage();
  }
}

@Module({ controllers: [CloudController] })
export class CloudModule {}
