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
  ActiveQueryDto,
  CreateProductDto,
  CreateServiceDto,
  CreateSupplierDto,
  ProductsQueryDto,
  StockMovementDto,
  UpdateProductDto,
  UpdateServiceDto,
  UpdateSupplierDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

// Leitura para todos os autenticados; escrita somente ADMIN (contrato: "leitura de catálogos").

@Controller('services')
export class ServicesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list(@Query() query: ActiveQueryDto) {
    return this.catalog.listServices(query);
  }
  @Post() @Roles('ADMIN') create(@Body() dto: CreateServiceDto) {
    return this.catalog.createService(dto);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getService(id);
  }
  @Put(':id') @Roles('ADMIN') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.catalog.updateService(id, dto);
  }
  @Delete(':id') @Roles('ADMIN') @HttpCode(204) remove(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.catalog.deactivateService(id);
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list(@Query() query: ProductsQueryDto) {
    return this.catalog.listProducts(query);
  }
  @Post() @Roles('ADMIN') create(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.createProduct(dto, user);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getProduct(id);
  }
  @Put(':id') @Roles('ADMIN') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(id, dto);
  }
  @Delete(':id') @Roles('ADMIN') @HttpCode(204) remove(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.catalog.deactivateProduct(id);
  }
  @Post(':id/stock') @Roles('ADMIN') stock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.catalog.moveProductStock(id, dto, user);
  }
  @Get(':id/movements') movements(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.catalog.listMovements(id, query);
  }
}

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly catalog: CatalogService) {}

  @Get() list(@Query() query: ActiveQueryDto) {
    return this.catalog.listSuppliers(query);
  }
  @Post() @Roles('ADMIN') create(@Body() dto: CreateSupplierDto) {
    return this.catalog.createSupplier(dto);
  }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getSupplier(id);
  }
  @Put(':id') @Roles('ADMIN') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.catalog.updateSupplier(id, dto);
  }
  @Delete(':id') @Roles('ADMIN') @HttpCode(204) remove(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.catalog.deactivateSupplier(id);
  }
}

@Module({
  controllers: [ServicesController, ProductsController, SuppliersController],
  providers: [CatalogService],
})
export class CatalogModule {}
