import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthorizationController } from './auth.Controller';
import { JwtModule } from '@nestjs/jwt';
import authConfig from './config/auth.config';
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: authConfig.jwtSecret,
      signOptions: { expiresIn: authConfig.expiresIn },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthorizationController],
})
export class AuthModule {}
