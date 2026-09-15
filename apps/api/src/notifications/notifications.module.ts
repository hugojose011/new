import { Global, Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { EMAIL_PROVIDER } from './notification.types';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { APP_CONFIG, AppConfig } from '../config/configuration';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        if (config.email.provider === 'resend' && config.email.apiKey) {
          return new ResendEmailProvider(config.email.apiKey, config.email.from);
        }
        return new ConsoleEmailProvider();
      },
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
