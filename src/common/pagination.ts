import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from './transforms';

export class PaginationQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export type Paginated<T> = {
  data: T[];
  meta: { page: number; page_size: number; total: number };
};

/** Monta o orderBy aceitando só campos da allowlist (evita ordenar por campos internos). */
export function orderByFrom(
  query: PaginationQueryDto,
  allowed: string[],
  fallback: Record<string, 'asc' | 'desc'>,
) {
  if (query.sort && allowed.includes(query.sort)) {
    return { [query.sort]: query.order ?? 'asc' };
  }
  return fallback;
}

export async function paginate<T>(
  query: PaginationQueryDto,
  count: () => Promise<number>,
  find: (args: { skip: number; take: number }) => Promise<T[]>,
): Promise<Paginated<T>> {
  const page = query.page ?? 1;
  const page_size = query.page_size ?? 20;
  const [total, data] = await Promise.all([
    count(),
    find({ skip: (page - 1) * page_size, take: page_size }),
  ]);
  return { data, meta: { page, page_size, total } };
}
