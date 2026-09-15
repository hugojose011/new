import { Module, forwardRef } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [AvailabilityModule, forwardRef(() => BookingsModule)],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
