import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { PublicBookingController } from './public-booking.controller';
import { BookingsService } from './bookings.service';
import { BookingTokensService } from './booking-tokens.service';
import { BookingConflictService } from './booking-conflict.service';
import { AvailabilityModule } from '../availability/availability.module';
import { GoogleModule } from '../integrations/google/google.module';
import { PublicModule } from '../public/public.module';

@Module({
  imports: [AvailabilityModule, GoogleModule, forwardRef(() => PublicModule)],
  controllers: [BookingsController, PublicBookingController],
  providers: [BookingsService, BookingTokensService, BookingConflictService],
  exports: [BookingsService, BookingTokensService, BookingConflictService],
})
export class BookingsModule {}
