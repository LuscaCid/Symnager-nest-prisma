import * as fs from 'fs';
import * as os from 'os';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Response } from 'express';
import { diskStorage } from 'multer';
import {
  AllowInternalToken,
  AuthUser,
  CurrentUser,
  Roles,
} from '../common/decorators';
import { BackupService } from './backup.service';

class RestoreDto {
  @IsString() @IsNotEmpty() @MaxLength(200) password: string;
}

const attachment = (filename: string) => `attachment; filename="${filename}"`;

@Controller('backup')
@Roles('ADMIN')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('database')
  @AllowInternalToken()
  async database(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const { file, filename } = await this.backup.databaseSnapshot(
      user.internal ? 'BACKUP_AUTO' : 'BACKUP_DATABASE',
    );
    res.download(file, filename, () =>
      fs.promises.unlink(file).catch(() => undefined),
    );
  }

  @Get('json')
  async json(@Res() res: Response) {
    const { filename, data } = await this.backup.jsonDump();
    res.setHeader('Content-Disposition', attachment(filename));
    res.json(data);
  }

  @Get('csv/:entity')
  async csv(@Param('entity') entity: string, @Res() res: Response) {
    const { filename, content } = await this.backup.csv(entity);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', attachment(filename));
    res.send(content);
  }

  @Post('restore')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: os.tmpdir() }),
      limits: { fileSize: 200 * 1024 * 1024, files: 1 },
    }),
  )
  restore(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: RestoreDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backup.restore(file, dto.password, user);
  }
}

@Module({
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
