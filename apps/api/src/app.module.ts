import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { rateLimitFor, RATE_LIMIT_WINDOW_MS } from './common/throttling';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './crypto/encryption.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GoogleModule } from './integrations/google/google.module';
import { AvailabilityModule } from './availability/availability.module';
import { EventTypesModule } from './event-types/event-types.module';
import { BookingsModule } from './bookings/bookings.module';
import { PublicModule } from './public/public.module';
import { HealthController } from './health.controller';
import { AuthGuard } from './auth/auth.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { RequestIdMiddleware } from './common/request-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    EncryptionModule,
    AuditModule,
    NotificationsModule,
    // Rate limiting por rota (§57): limites distintos para login, consulta
    // pública e criação de reserva, todos folgados para uso normal.
    // Um único limitador global; rotas sensíveis sobrescrevem o próprio
    // limite com os decorators de src/common/throttling.ts.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: () => rateLimitFor('default') },
    ]),
    AuthModule,
    UsersModule,
    GoogleModule,
    AvailabilityModule,
    EventTypesModule,
    BookingsModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: sessão -> CSRF -> rate limit.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
