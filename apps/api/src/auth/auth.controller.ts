import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthRateLimit } from '../common/throttling';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { Inject } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @AuthRateLimit()
  @ApiOperation({ summary: 'Cria uma conta e inicia a sessão.' })
  @ApiResponse({ status: 201, description: 'Conta criada.' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado.' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.register(dto);
    await this.startSession(res, user);
    return this.serialize(user);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @AuthRateLimit()
  @ApiOperation({ summary: 'Autentica e inicia a sessão (cookie HttpOnly).' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateCredentials(dto.email, dto.password);
    await this.startSession(res, user);
    await this.audit.record({
      userId: user.id,
      workspaceId: user.workspaceId,
      action: 'USER_LOGGED_IN',
    });
    return this.serialize(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessão.' })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.clearCookie(CSRF_COOKIE, { ...this.cookieOptions(), httpOnly: false });
  }

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado.' })
  async me(@CurrentUser() current: AuthenticatedUser, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { id: current.id } });
    if (!user) throw new UnauthorizedException('Sessão inválida.');

    const connection = await this.prisma.calendarConnection.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...this.serialize(user),
      csrfToken: req.cookies?.[CSRF_COOKIE] ?? null,
      googleStatus: connection?.status ?? null,
    };
  }

  private async startSession(
    res: Response,
    user: { id: string; workspaceId: string; email: string },
  ) {
    const token = await this.authService.issueSession(user);
    const maxAge = this.config.sessionTtlMinutes * 60 * 1000;

    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge });
    // Cookie legível pelo frontend: base do double submit contra CSRF.
    res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
      ...this.cookieOptions(),
      httpOnly: false,
      maxAge,
    });
  }

  private cookieOptions() {
    const isProduction = this.config.nodeEnv === 'production';
    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private serialize(user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    timezone: string;
    locale: string;
    onboardingDone: boolean;
    onboardingStep: number;
    workspaceId: string;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      timezone: user.timezone,
      locale: user.locale,
      onboardingDone: user.onboardingDone,
      onboardingStep: user.onboardingStep,
      workspaceId: user.workspaceId,
    };
  }
}
