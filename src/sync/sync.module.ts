import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import { Response } from 'express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as os from 'os';
import * as path from 'path';
import { AuditService } from '../audit/audit.service';
import { BackupModule } from '../backup/backup.module';
import { BackupService } from '../backup/backup.service';
import {
  AllowInternalToken,
  AuthUser,
  CurrentUser,
  Roles,
} from '../common/decorators';
import { loadConfig } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { PlanLimitsService } from '../plans/plan-limits.service';
import { extractTar, writeTar } from './tar';

const PHOTO_ENTRY = /^photos\/\d{1,10}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const isCloud = () => loadConfig().appMode === 'cloud';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Pasta de trabalho no mesmo disco dos dados: rename em vez de cópia. */
const workDir = () => path.join(loadConfig().dataDir, '.sync');

async function moveDir(from: string, to: string) {
  try {
    await fs.promises.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.cp(from, to, { recursive: true });
    await fs.promises.rm(from, { recursive: true, force: true });
  }
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backup: BackupService,
    private readonly audit: AuditService,
    private readonly limits: PlanLimitsService,
  ) {}

  /** Nuvem: pacote com o banco do cliente e as fotos, para alimentar o banco local. */
  async export(res: Response) {
    const tmp = path.join(
      os.tmpdir(),
      `symnager-export-${randomBytes(6).toString('hex')}.db`,
    );
    await this.prisma.$executeRawUnsafe(
      `VACUUM INTO '${tmp.replace(/'/g, "''")}'`,
    );
    try {
      const root = this.limits.photosRoot();
      const photos = await this.prisma.order_photos.findMany({
        select: { order_id: true, file_name: true },
      });
      const entries = [{ name: 'database.db', file: tmp }];
      for (const p of photos) {
        const name = `photos/${p.order_id}/${p.file_name}`;
        const file = path.join(root, String(p.order_id), p.file_name);
        if (PHOTO_ENTRY.test(name) && fs.existsSync(file))
          entries.push({ name, file });
      }
      await this.audit.log({
        action: 'SYNC_EXPORT',
        entity: 'backup',
        meta: { photos: entries.length - 1 },
      });
      res.setHeader('Content-Type', 'application/x-tar');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="symnager-nuvem-${stamp()}.tar"`,
      );
      res.setHeader('Cache-Control', 'no-store');
      await writeTar(entries, res);
      res.end();
    } finally {
      fs.promises.unlink(tmp).catch(() => undefined);
    }
  }

  /** Desktop: troca o banco local e as fotos pelo pacote baixado da nuvem. */
  async import(upload: Express.Multer.File | undefined) {
    if (!upload)
      throw new BadRequestException('Envie o pacote no campo "file".');
    const dir = path.join(
      workDir(),
      `import-${randomBytes(6).toString('hex')}`,
    );
    try {
      const names = await extractTar(
        upload.path,
        dir,
        (n) => n === 'database.db' || PHOTO_ENTRY.test(n),
      );
      if (!names.includes('database.db'))
        throw new BadRequestException('O pacote não contém o banco de dados.');
      const photosCount = names.length - 1;
      const root = this.limits.photosRoot();
      let previous: string | null = null;

      const safety = await this.backup.swapDatabase(
        path.join(dir, 'database.db'),
        async () => {
          const incoming = path.join(dir, 'photos');
          await fs.promises.mkdir(incoming, { recursive: true });
          if (fs.existsSync(root)) {
            previous = `${root}.bak-${stamp()}`;
            await moveDir(root, previous);
          }
          try {
            await moveDir(incoming, root);
          } catch (e) {
            if (previous) await moveDir(previous, root).catch(() => undefined);
            previous = null;
            throw e;
          }
        },
      );
      // Guarda só a cópia de fotos mais recente.
      const parent = path.dirname(root);
      for (const entry of await fs.promises.readdir(parent)) {
        const full = path.join(parent, entry);
        if (
          entry.startsWith(`${path.basename(root)}.bak-`) &&
          full !== previous
        )
          await fs.promises
            .rm(full, { recursive: true, force: true })
            .catch(() => undefined);
      }

      const [orders, clients] = await Promise.all([
        this.prisma.orders.count(),
        this.prisma.clients.count(),
      ]);
      await this.audit.log({
        action: 'SYNC_IMPORT',
        entity: 'backup',
        user_id: null,
        meta: {
          orders,
          clients,
          photos: photosCount,
          safety_copy: path.basename(safety),
        },
      });
      return {
        ok: true,
        safety_copy: path.basename(safety),
        orders,
        clients,
        photos: photosCount,
      };
    } finally {
      fs.promises
        .rm(dir, { recursive: true, force: true })
        .catch(() => undefined);
      fs.promises.unlink(upload.path).catch(() => undefined);
    }
  }
}

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('export')
  @Roles('ADMIN')
  @Throttle({ default: { ttl: 3_600_000, limit: 10 } })
  async export(@Res() res: Response) {
    if (!isCloud()) throw new NotFoundException();
    await this.sync.export(res);
  }

  /** Só o processo principal do Electron (x-internal-token) chama: troca o banco local. */
  @Post('import')
  @HttpCode(200)
  @AllowInternalToken()
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          fs.mkdirSync(workDir(), { recursive: true });
          cb(null, workDir());
        },
      }),
      limits: { fileSize: 64 * 1024 * 1024 * 1024, files: 1 },
    }),
  )
  import(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (isCloud()) throw new NotFoundException();
    if (!user?.internal) {
      if (file) fs.promises.unlink(file.path).catch(() => undefined);
      throw new ForbiddenException('Rota interna.');
    }
    return this.sync.import(file);
  }
}

@Module({
  imports: [BackupModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
