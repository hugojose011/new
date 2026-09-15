import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { CALENDAR_PROVIDER } from '../../src/integrations/calendar-provider';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { FakeCalendarProvider } from './fake-calendar.provider';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  calendar: FakeCalendarProvider;
}

/** Sobe a aplicação real, trocando apenas o provedor de calendário. */
export async function createTestApp(): Promise<TestContext> {
  const calendar = new FakeCalendarProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CALENDAR_PROVIDER)
    .useValue(calendar)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, prisma: app.get(PrismaService), calendar };
}

/** Limpa as tabelas entre os testes preservando o schema. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      booking_history, booking_answers, bookings,
      event_questions, event_types,
      availability_override_intervals, availability_overrides, availability_rules,
      availability_schedules,
      connected_calendars, calendar_connections,
      audit_logs, workspace_members, users, workspaces
    RESTART IDENTITY CASCADE
  `);
}
