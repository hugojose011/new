import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CancelBookingDto } from './dto/booking.dto';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Get()
  @ApiQuery({ name: 'filter', required: false, enum: ['upcoming', 'past', 'cancelled', 'all'] })
  @ApiOperation({ summary: 'Lista os agendamentos do host.' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('filter') filter?: 'upcoming' | 'past' | 'cancelled' | 'all',
  ) {
    return this.service.listForHost(user.id, filter ?? 'upcoming');
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumo para o dashboard.' })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summaryForHost(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um agendamento do host.' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getForHost(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela um agendamento pelo dashboard.' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.service.cancelAsHost(user.id, id, dto);
  }
}
