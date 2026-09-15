import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingRateLimit, PublicRateLimit } from '../common/throttling';
import { PublicService } from './public.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CreateBookingDto } from '../bookings/dto/booking.dto';
import { BookingsService } from '../bookings/bookings.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('public')
@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly service: PublicService,
    private readonly bookings: BookingsService,
  ) {}

  @Get(':username/:eventSlug')
  @PublicRateLimit()
  @ApiOperation({ summary: 'Dados públicos de um tipo de evento.' })
  @ApiResponse({ status: 404, description: 'Link inexistente ou desativado.' })
  getEventType(@Param('username') username: string, @Param('eventSlug') slug: string) {
    return this.service.getPublicEventType(username, slug);
  }

  @Get(':username/:eventSlug/availability')
  @PublicRateLimit()
  @ApiOperation({ summary: 'Horários disponíveis no intervalo pedido.' })
  getAvailability(
    @Param('username') username: string,
    @Param('eventSlug') slug: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.service.getAvailability(username, slug, query);
  }

  @Post(':username/:eventSlug/book')
  @HttpCode(HttpStatus.CREATED)
  @BookingRateLimit()
  @ApiOperation({ summary: 'Cria uma reserva revalidando a disponibilidade.' })
  @ApiResponse({ status: 201, description: 'Reserva confirmada.' })
  @ApiResponse({ status: 409, description: 'O horário deixou de estar disponível.' })
  @ApiResponse({ status: 503, description: 'Google Agenda indisponível; nada foi confirmado.' })
  async book(
    @Param('username') username: string,
    @Param('eventSlug') slug: string,
    @Body() dto: CreateBookingDto,
  ) {
    const eventType = await this.service.findEventType(username, slug);
    const confirmation = await this.bookings.create(eventType, dto);
    this.service.invalidate(eventType.id);
    return confirmation;
  }
}
