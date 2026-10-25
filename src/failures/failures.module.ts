import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/decorators';
import {
  CreateFailureDto,
  FailuresQueryDto,
  PeriodQueryDto,
  UpdateFailureDto,
} from './failures.dto';
import { FailuresService } from './failures.service';

@Controller()
export class FailuresController {
  constructor(private readonly failures: FailuresService) {}

  @Get('failures')
  list(@Query() query: FailuresQueryDto) {
    return this.failures.list(query);
  }

  @Get('failures/stats')
  stats(@Query() query: PeriodQueryDto) {
    return this.failures.stats(query);
  }

  @Put('failures/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFailureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.failures.update(id, dto, user);
  }

  @Delete('failures/:id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.failures.remove(id);
  }

  @Get('orders/:id/failures')
  listForOrder(@Param('id', ParseIntPipe) id: number) {
    return this.failures.listForOrder(id);
  }

  @Post('orders/:id/failures')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFailureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.failures.create(id, dto, user);
  }
}

@Module({
  controllers: [FailuresController],
  providers: [FailuresService],
})
export class FailuresModule {}
