import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from '../common/decorators';
import {
  orderByFrom,
  paginate,
  PaginationQueryDto,
} from '../common/pagination';
import { USER_REF } from '../users/user.select';
import { moveStock } from './stock';
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

const PRODUCT_INCLUDE = {
  supplier: { select: { supplier_id: true, name: true } },
} as const;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- serviços

  listServices(query: ActiveQueryDto) {
    const where: Prisma.servicesWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q } },
          { description: { contains: query.q } },
        ],
      }),
    };
    return paginate(
      query,
      () => this.prisma.services.count({ where }),
      (page) =>
        this.prisma.services.findMany({
          where,
          ...page,
          orderBy: orderByFrom(query, ['name', 'price', 'created_at'], {
            name: 'asc',
          }),
        }),
    );
  }

  async getService(id: number) {
    const service = await this.prisma.services.findUnique({
      where: { service_id: id },
    });
    if (!service) throw new NotFoundException('Serviço não encontrado.');
    return service;
  }

  createService(dto: CreateServiceDto) {
    return this.prisma.services.create({ data: dto });
  }

  async updateService(id: number, dto: UpdateServiceDto) {
    await this.getService(id);
    return this.prisma.services.update({
      where: { service_id: id },
      data: dto,
    });
  }

  async deactivateService(id: number) {
    await this.getService(id);
    await this.prisma.services.update({
      where: { service_id: id },
      data: { active: false },
    });
  }

  // ---------------------------------------------------------------- produtos

  async listProducts(query: ProductsQueryDto) {
    const where: Prisma.productsWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q } },
          { sku: { contains: query.q } },
          { description: { contains: query.q } },
        ],
      }),
    };
    if (query.low_stock) {
      // Prisma não compara duas colunas; filtra os ids via SQL.
      const rows = await this.prisma.$queryRawUnsafe<{ product_id: number }[]>(
        'SELECT product_id FROM products WHERE stock <= min_stock',
      );
      where.product_id = { in: rows.map((r) => Number(r.product_id)) };
    }
    return paginate(
      query,
      () => this.prisma.products.count({ where }),
      (page) =>
        this.prisma.products.findMany({
          where,
          ...page,
          include: PRODUCT_INCLUDE,
          orderBy: orderByFrom(
            query,
            ['name', 'sku', 'stock', 'sale_price', 'created_at'],
            { name: 'asc' },
          ),
        }),
    );
  }

  async getProduct(id: number) {
    const product = await this.prisma.products.findUnique({
      where: { product_id: id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }

  async createProduct(dto: CreateProductDto, user: AuthUser) {
    const { stock, ...data } = dto;
    if (data.supplier_id) await this.getSupplier(data.supplier_id);
    const id = await this.prisma.$transaction(async (tx) => {
      const product = await tx.products.create({ data: { ...data, stock: 0 } });
      if (stock) {
        await moveStock(tx, {
          product_id: product.product_id,
          delta: stock,
          type: 'IN',
          reason: 'Estoque inicial',
          user_id: user.user_id,
        });
      }
      return product.product_id;
    });
    return this.getProduct(id);
  }

  async updateProduct(id: number, dto: UpdateProductDto) {
    await this.getProduct(id);
    if (dto.stock !== undefined) {
      throw new BadRequestException(
        'Use POST /products/:id/stock para alterar o estoque.',
      );
    }
    if (dto.supplier_id) await this.getSupplier(dto.supplier_id);
    return this.prisma.products.update({
      where: { product_id: id },
      data: dto,
      include: PRODUCT_INCLUDE,
    });
  }

  async deactivateProduct(id: number) {
    await this.getProduct(id);
    await this.prisma.products.update({
      where: { product_id: id },
      data: { active: false },
    });
  }

  async moveProductStock(id: number, dto: StockMovementDto, user: AuthUser) {
    const product = await this.getProduct(id);
    const delta =
      dto.type === 'IN'
        ? dto.quantity
        : dto.type === 'OUT'
          ? -dto.quantity
          : dto.quantity - product.stock;
    if (dto.type !== 'ADJUST' && dto.quantity === 0) {
      throw new BadRequestException('quantity deve ser maior que zero.');
    }
    await this.prisma.$transaction((tx) =>
      moveStock(tx, {
        product_id: id,
        delta,
        type: dto.type,
        reason: dto.reason,
        user_id: user.user_id,
      }),
    );
    return this.getProduct(id);
  }

  async listMovements(id: number, query: PaginationQueryDto) {
    await this.getProduct(id);
    const where = { product_id: id };
    const result = await paginate(
      query,
      () => this.prisma.stock_movements.count({ where }),
      (page) =>
        this.prisma.stock_movements.findMany({
          where,
          ...page,
          orderBy: { created_at: 'desc' },
          include: {
            user: USER_REF,
            order: { select: { order_id: true, number: true } },
          },
        }),
    );
    return { ...result, data: result.data.map(({ user_id: _u, ...m }) => m) };
  }

  // ------------------------------------------------------------- fornecedores

  listSuppliers(query: ActiveQueryDto) {
    const where: Prisma.suppliersWhereInput = {
      ...(query.active !== undefined && { active: query.active }),
      ...(query.q && {
        OR: [
          { name: { contains: query.q } },
          { document: { contains: query.q } },
          { email: { contains: query.q } },
          { contact: { contains: query.q } },
        ],
      }),
    };
    return paginate(
      query,
      () => this.prisma.suppliers.count({ where }),
      (page) =>
        this.prisma.suppliers.findMany({
          where,
          ...page,
          orderBy: orderByFrom(query, ['name', 'created_at'], { name: 'asc' }),
        }),
    );
  }

  async getSupplier(id: number) {
    const supplier = await this.prisma.suppliers.findUnique({
      where: { supplier_id: id },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado.');
    return supplier;
  }

  createSupplier(dto: CreateSupplierDto) {
    return this.prisma.suppliers.create({ data: dto });
  }

  async updateSupplier(id: number, dto: UpdateSupplierDto) {
    await this.getSupplier(id);
    return this.prisma.suppliers.update({
      where: { supplier_id: id },
      data: dto,
    });
  }

  async deactivateSupplier(id: number) {
    await this.getSupplier(id);
    await this.prisma.suppliers.update({
      where: { supplier_id: id },
      data: { active: false },
    });
  }
}
