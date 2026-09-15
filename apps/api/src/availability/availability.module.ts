import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { GoogleModule } from '../integrations/google/google.module';

@Module({
  imports: [GoogleModule],
  controllers: [SchedulesController],
  providers: [AvailabilityService, SchedulesService],
  exports: [AvailabilityService, SchedulesService],
})
export class AvailabilityModule {}
