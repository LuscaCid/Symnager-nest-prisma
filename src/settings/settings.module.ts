import { Body, Controller, Get, Global, Module, Put } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getPublicView();
  }

  @Put()
  @Roles('ADMIN')
  async update(@Body() dto: UpdateSettingsDto) {
    await this.settings.update(dto);
    return this.settings.getPublicView();
  }
}

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
