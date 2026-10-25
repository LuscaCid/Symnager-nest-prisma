import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { loadConfig } from '../config/env';
import { AuthUser, CurrentUser, Public } from '../common/decorators';
import { UsersService } from '../users/users.service';
import { LoginDto, RefreshDto, SetupDto } from './auth.dto';
import { AuthService, ClientMeta } from './auth.service';

export const REFRESH_COOKIE = 'symnager_rt';

@Controller('auth')
export class AuthController {
  private readonly config = loadConfig();

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Get('status')
  status() {
    return this.auth.status();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('setup')
  async setup(
    @Body() dto: SetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withCookie(res, await this.auth.setup(dto, this.meta(req)));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withCookie(res, await this.auth.login(dto, this.meta(req)));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refresh_token ?? req.cookies?.[REFRESH_COOKIE];
    try {
      return this.withCookie(
        res,
        await this.auth.refresh(token, this.meta(req)),
      );
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @HttpCode(204)
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(
      dto.refresh_token ?? req.cookies?.[REFRESH_COOKIE],
      user.session_id,
    );
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.user_id);
  }

  private meta(req: Request): ClientMeta {
    return {
      ip: req.ip ?? null,
      user_agent: req.headers['user-agent'] ?? null,
    };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.config.cookieSecure,
      path: '/api/auth',
    };
  }

  private withCookie<T extends { refresh_token: string }>(
    res: Response,
    body: T,
  ): T {
    res.cookie(REFRESH_COOKIE, body.refresh_token, {
      ...this.cookieOptions(),
      maxAge: this.config.refreshTtlDays * 86400_000,
    });
    return body;
  }

  private clearCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
