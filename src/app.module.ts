import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NextFunction, Request, Response } from 'express';
import { PrismaModule } from './database/prisma.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { FailuresModule } from './failures/failures.module';
import { CatalogModule } from './catalog/catalog.module';
import { LookupsModule } from './lookups/lookups.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PublicModule } from './public/public.module';
import { BackupModule } from './backup/backup.module';
import { PlansModule } from './plans/plan-limits.service';
import { PhotosModule } from './photos/photos.module';
import { SyncModule } from './sync/sync.module';
import { CloudModule } from './cloud/cloud.module';
import { SegmentsModule } from './segments/segments.module';
import { CertificatesModule } from './certificates/certificates.module';
import { HealthController } from './health/health.controller';
import { LicenseGuard, LicenseModule } from './license/license.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { requestContext } from './common/request-context';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage: 'Muitas requisições. Aguarde um momento e tente novamente.',
    }),
    PrismaModule,
    AuditModule,
    SettingsModule,
    LicenseModule,
    PlansModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    OrdersModule,
    FailuresModule,
    CatalogModule,
    LookupsModule,
    DashboardModule,
    PublicModule,
    BackupModule,
    PhotosModule,
    SyncModule,
    CloudModule,
    SegmentsModule,
    CertificatesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: rate limit -> licença -> autenticação -> papéis.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: LicenseGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) =>
        requestContext.run({ ip: req.ip ?? null, user_id: null }, next),
      )
      .forRoutes('*');
  }
}
