import { Body, Controller, Delete, Get, Inject, Put, Query, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GoogleIntegrationService } from './google-integration.service';
import { UpdateCalendarsDto } from './dto/calendars.dto';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { APP_CONFIG, AppConfig } from '../../config/configuration';

@ApiTags('integrations/google')
@Controller('integrations/google')
export class GoogleController {
  constructor(
    private readonly service: GoogleIntegrationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('connect')
  @ApiOperation({ summary: 'Gera a URL de autorização OAuth do Google.' })
  connect(@CurrentUser() user: AuthenticatedUser) {
    return { url: this.service.buildAuthUrl(user.id) };
  }

  /**
   * Callback do Google. É público por definição (o Google redireciona o
   * navegador para cá sem os nossos cookies garantidos): a autenticidade vem
   * do `state` assinado, não da sessão.
   */
  @Public()
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const redirect = (status: string) =>
      res.redirect(`${this.config.webUrl}/integracoes?google=${status}`);

    if (error) return redirect('denied');
    if (!code || !state) return redirect('invalid');

    try {
      await this.service.handleCallback(code, state);
      return redirect('connected');
    } catch {
      // Detalhes ficam no log; a URL nunca carrega mensagem de erro técnica.
      return redirect('error');
    }
  }

  @Get('calendars')
  @ApiOperation({ summary: 'Lista as agendas da conta conectada e suas preferências.' })
  getCalendars(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getConnection(user.id);
  }

  @Put('calendars')
  @ApiOperation({ summary: 'Define agendas de conflito e a agenda de destino.' })
  updateCalendars(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCalendarsDto) {
    return this.service.updateCalendarPreferences(user.id, {
      conflictCalendarIds: dto.conflictCalendarIds,
      destinationCalendarId: dto.destinationCalendarId ?? null,
    });
  }

  @Get('refresh')
  @ApiOperation({ summary: 'Reimporta a lista de agendas do Google.' })
  async refresh(@CurrentUser() user: AuthenticatedUser) {
    const connection = await this.service.getConnection(user.id);
    return connection;
  }

  @Delete()
  @ApiOperation({ summary: 'Desconecta a conta Google e apaga os tokens.' })
  async disconnect(@CurrentUser() user: AuthenticatedUser) {
    await this.service.disconnect(user.id);
    return { disconnected: true };
  }
}
