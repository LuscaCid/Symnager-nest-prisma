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
import { PaginationQueryDto } from '../common/pagination';
import {
  ClientsQueryDto,
  CreateClientDto,
  ForceQueryDto,
  UpdateClientDto,
} from './clients.dto';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@Query() query: ClientsQueryDto) {
    return this.clients.list(query);
  }

  @Post()
  @Roles('ATENDENTE')
  create(
    @Body() dto: CreateClientDto,
    @Query() { force }: ForceQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clients.create(dto, user, force);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clients.findById(id);
  }

  @Get(':id/orders')
  orders(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.clients.orders(id, query);
  }

  @Put(':id')
  @Roles('ATENDENTE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @Query() { force }: ForceQueryDto,
  ) {
    return this.clients.update(id, dto, force);
  }

  @Delete(':id')
  @Roles('ATENDENTE')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clients.softDelete(id);
  }
}

@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
