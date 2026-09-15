import { Module } from '@nestjs/common';
import { GoogleController } from './google.controller';
import { GoogleIntegrationService } from './google-integration.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleCalendarProvider } from './google-calendar.provider';
import { CALENDAR_PROVIDER } from '../calendar-provider';

@Module({
  controllers: [GoogleController],
  providers: [
    GoogleIntegrationService,
    GoogleOAuthService,
    GoogleCalendarProvider,
    { provide: CALENDAR_PROVIDER, useExisting: GoogleCalendarProvider },
  ],
  exports: [
    GoogleIntegrationService,
    GoogleOAuthService,
    GoogleCalendarProvider,
    CALENDAR_PROVIDER,
  ],
})
export class GoogleModule {}
