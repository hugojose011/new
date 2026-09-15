import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingRateLimit, PublicRateLimit } from '../common/throttling';
import { DateTime } from 'luxon';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, RescheduleBookingDto } from './dto/booking.dto';
import { Public } from '../common/decorators/public.decorator';
import { PublicService } from '../public/public.service';

/**
 * Gestão da reserva pelo convidado, autenticada por token de uso único
 * embutido no link (§36/§37). Não exige conta no sistema.
 */
@ApiTags('booking-management')
@Public()
@Controller('booking')
export class PublicBookingController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly publicService: PublicService,
  ) {}

  @Get('cancel/:token')
  @PublicRateLimit()
  @ApiOperation({ summary: 'Dados da reserva para a tela de cancelamento.' })
  async getForCancel(@Param('token') token: string) {
    const booking = await this.bookings.findByCancelToken(token);
    return this.serialize(booking);
  }

  @Post('cancel/:token')
  @HttpCode(HttpStatus.OK)
  @BookingRateLimit()
  @ApiOperation({ summary: 'Cancela a reserva (idempotente).' })
  @ApiResponse({ status: 422, description: 'Fora do prazo mínimo de cancelamento.' })
  async cancel(@Param('token') token: string, @Body() dto: CancelBookingDto) {
    const booking = await this.bookings.findByCancelToken(token);
    const result = await this.bookings.cancelByToken(token, dto);
    this.publicService.invalidate(booking.eventTypeId);
    return result;
  }

  @Get('reschedule/:token')
  @PublicRateLimit()
  @ApiOperation({ summary: 'Dados da reserva para a tela de reagendamento.' })
  async getForReschedule(@Param('token') token: string) {
    const booking = await this.bookings.findByRescheduleToken(token);
    return {
      ...this.serialize(booking),
      eventType: {
        id: booking.eventType.id,
        slug: booking.eventType.slug,
        name: booking.eventType.name,
        durationMinutes: booking.eventType.durationMinutes,
      },
      hostUsername: booking.host.username,
    };
  }

  @Post('reschedule/:token')
  @HttpCode(HttpStatus.OK)
  @BookingRateLimit()
  @ApiOperation({ summary: 'Move a reserva para outro horário.' })
  @ApiResponse({ status: 409, description: 'O novo horário deixou de estar disponível.' })
  async reschedule(@Param('token') token: string, @Body() dto: RescheduleBookingDto) {
    const booking = await this.bookings.findByRescheduleToken(token);
    const result = await this.bookings.rescheduleByToken(token, dto);
    this.publicService.invalidate(booking.eventTypeId);
    return result;
  }

  private serialize(booking: Awaited<ReturnType<BookingsService['findByCancelToken']>>) {
    return {
      id: booking.id,
      status: booking.status,
      eventName: booking.eventNameSnapshot,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      timezone: booking.inviteeTimezone,
      hostName: booking.host.name,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      meetUrl: booking.googleMeetUrl,
      locationType: booking.locationTypeSnapshot,
      canCancel: booking.status === 'CONFIRMED' || booking.status === 'PENDING',
      startAtLocal: DateTime.fromJSDate(booking.startAt, { zone: booking.inviteeTimezone }).toISO(),
    };
  }
}
