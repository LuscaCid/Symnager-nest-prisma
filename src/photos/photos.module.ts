import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs';
import { memoryStorage } from 'multer';
import * as path from 'path';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { Trim } from '../common/transforms';
import { PrismaService } from '../database/prisma.service';
import { PlanLimitsService } from '../plans/plan-limits.service';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Tipo pelo conteúdo (assinatura do arquivo), não pelo nome ou header enviado. */
function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' };
  if (
    buf.length > 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { mime: 'image/png', ext: 'png' };
  if (
    buf.length > 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  return null;
}

const SAFE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

const PHOTO_SELECT = {
  photo_id: true,
  order_id: true,
  file_name: true,
  original_name: true,
  mime: true,
  size: true,
  caption: true,
  created_at: true,
  user: { select: { user_id: true, name: true } },
} as const;

type PhotoRow = {
  photo_id: number;
  order_id: number;
  original_name: string | null;
  mime: string;
  size: number;
  caption: string | null;
  created_at: Date;
  user: { user_id: number; name: string } | null;
};

const serialize = (p: PhotoRow) => ({
  id: p.photo_id,
  order_id: p.order_id,
  original_name: p.original_name,
  mime: p.mime,
  size: p.size,
  caption: p.caption,
  created_at: p.created_at,
  user: p.user ? { id: p.user.user_id, name: p.user.name } : null,
});

class PhotoDto {
  @IsOptional() @Trim() @IsString() @MaxLength(200) caption?: string;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  private orderDir(orderId: number) {
    return path.join(this.limits.photosRoot(), String(orderId));
  }

  private async ensureOrder(orderId: number) {
    const order = await this.prisma.orders.findUnique({
      where: { order_id: orderId },
      select: { order_id: true },
    });
    if (!order) throw new NotFoundException('Ordem de serviço não encontrada.');
  }

  private async find(orderId: number, photoId: number) {
    const photo = await this.prisma.order_photos.findFirst({
      where: { photo_id: photoId, order_id: orderId },
      select: { ...PHOTO_SELECT, user_id: true },
    });
    if (!photo) throw new NotFoundException('Foto não encontrada.');
    return photo;
  }

  async list(orderId: number) {
    await this.ensureOrder(orderId);
    const rows = await this.prisma.order_photos.findMany({
      where: { order_id: orderId },
      select: PHOTO_SELECT,
      orderBy: { photo_id: 'asc' },
    });
    return rows.map(serialize);
  }

  async upload(
    orderId: number,
    file: Express.Multer.File | undefined,
    caption: string | undefined,
    user: AuthUser,
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException('Envie a imagem no campo "file".');
    const kind = sniffImage(file.buffer);
    if (!kind)
      throw new BadRequestException(
        'Formato não suportado. Envie JPEG, PNG ou WebP.',
      );
    await this.ensureOrder(orderId);
    await this.limits.assertPhotos(orderId);
    await this.limits.assertStorage(file.size);

    const fileName = `${randomUUID()}.${kind.ext}`;
    const dir = this.orderDir(orderId);
    await fs.promises.mkdir(dir, { recursive: true });
    const target = path.join(dir, fileName);
    await fs.promises.writeFile(target, file.buffer, { mode: 0o600 });
    try {
      const photo = await this.prisma.order_photos.create({
        data: {
          order_id: orderId,
          file_name: fileName,
          original_name: (file.originalname || '').slice(0, 200) || null,
          mime: kind.mime,
          size: file.size,
          caption: caption || null,
          user_id: user.user_id,
        },
        select: PHOTO_SELECT,
      });
      this.limits.touchStorage(file.size);
      await this.audit.log({
        action: 'PHOTO_ADD',
        entity: 'orders',
        entity_id: orderId,
        meta: { photo_id: photo.photo_id, size: file.size },
      });
      return serialize(photo);
    } catch (e) {
      await fs.promises.unlink(target).catch(() => undefined);
      throw e;
    }
  }

  async file(orderId: number, photoId: number) {
    const photo = await this.find(orderId, photoId);
    if (!SAFE_NAME.test(photo.file_name))
      throw new NotFoundException('Foto não encontrada.');
    const full = path.join(this.orderDir(orderId), photo.file_name);
    if (!fs.existsSync(full))
      throw new NotFoundException('Arquivo da foto não encontrado.');
    return { full, mime: photo.mime };
  }

  async remove(orderId: number, photoId: number, user: AuthUser) {
    const photo = await this.find(orderId, photoId);
    if (user.role !== 'ADMIN' && photo.user_id !== user.user_id)
      throw new ForbiddenException(
        'Só quem enviou a foto ou um administrador pode excluí-la.',
      );
    await this.prisma.order_photos.delete({ where: { photo_id: photoId } });
    if (SAFE_NAME.test(photo.file_name))
      await fs.promises
        .unlink(path.join(this.orderDir(orderId), photo.file_name))
        .catch(() => undefined);
    this.limits.touchStorage(-photo.size);
    await this.audit.log({
      action: 'PHOTO_DELETE',
      entity: 'orders',
      entity_id: orderId,
      meta: { photo_id: photoId },
    });
  }
}

@Controller('orders/:id/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get()
  list(@Param('id', ParseIntPipe) id: number) {
    return this.photos.list(id);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    }),
  )
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PhotoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.photos.upload(id, file, dto.caption, user);
  }

  @Get(':photoId/file')
  async file(
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res() res: Response,
  ) {
    const { full, mime } = await this.photos.file(id, photoId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(full);
  }

  @Delete(':photoId')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.photos.remove(id, photoId, user);
  }
}

@Module({
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
