import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { Roles } from '../common/decorators';
import { LOOKUP_KINDS } from '../common/enums';
import { ToBoolean, Trim } from '../common/transforms';

type LookupKind = (typeof LOOKUP_KINDS)[number];

class CreateLookupDto {
  @IsIn(LOOKUP_KINDS) kind: LookupKind;
  @Trim(false) @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number;
}

class UpdateLookupDto extends PartialType(CreateLookupDto) {}

class LookupsQueryDto {
  @IsOptional() @IsIn(LOOKUP_KINDS) kind?: LookupKind;
  @IsOptional() @ToBoolean() @IsBoolean() active?: boolean;
}

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: LookupsQueryDto) {
    return this.prisma.lookups.findMany({
      where: {
        ...(query.kind && { kind: query.kind }),
        ...(query.active !== undefined && { active: query.active }),
      },
      orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateLookupDto) {
    await this.ensureUnique(dto.kind, dto.name);
    if (dto.sort === undefined) {
      const last = await this.prisma.lookups.aggregate({
        where: { kind: dto.kind },
        _max: { sort: true },
      });
      dto.sort = (last._max.sort ?? -1) + 1;
    }
    return this.prisma.lookups.create({ data: dto });
  }

  async update(id: number, dto: UpdateLookupDto) {
    const current = await this.get(id);
    if (dto.kind || dto.name)
      await this.ensureUnique(
        dto.kind ?? current.kind,
        dto.name ?? current.name,
        id,
      );
    return this.prisma.lookups.update({ where: { lookup_id: id }, data: dto });
  }

  async remove(id: number) {
    await this.get(id);
    await this.prisma.lookups.delete({ where: { lookup_id: id } });
  }

  private async get(id: number) {
    const lookup = await this.prisma.lookups.findUnique({
      where: { lookup_id: id },
    });
    if (!lookup) throw new NotFoundException('Cadastro não encontrado.');
    return lookup;
  }

  private async ensureUnique(kind: string, name: string, exceptId?: number) {
    const existing = await this.prisma.lookups.findFirst({
      where: { kind, name, ...(exceptId && { NOT: { lookup_id: exceptId } }) },
    });
    if (existing) throw new ConflictException(`"${name}" já está cadastrado.`);
  }
}

@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get() list(@Query() query: LookupsQueryDto) {
    return this.lookups.list(query);
  }
  @Post() @Roles('ADMIN') create(@Body() dto: CreateLookupDto) {
    return this.lookups.create(dto);
  }
  @Put(':id') @Roles('ADMIN') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLookupDto,
  ) {
    return this.lookups.update(id, dto);
  }
  @Delete(':id') @Roles('ADMIN') @HttpCode(204) remove(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lookups.remove(id);
  }
}

@Module({
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
