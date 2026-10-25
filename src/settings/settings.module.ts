import { Body, Controller, Get, Global, Module, Put } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';
import { LicenseService } from '../license/license.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly license: LicenseService,
  ) {}

  @Get()
  async get() {
    return {
      ...(await this.settings.getPublicView()),
      license: this.license.status(),
    };
  }

  @Put()
  @Roles('ADMIN')
  async update(@Body() dto: UpdateSettingsDto) {
    await this.settings.update(dto);
    return {
      ...(await this.settings.getPublicView()),
      license: this.license.status(),
    };
  }
}

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
