import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StructuredLogger } from './common/logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger(),
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // O frontend roda em outra origem em desenvolvimento; cookies exigem
  // credentials + origem explícita (nunca "*").
  app.enableCors({
    origin: [config.webUrl],
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos não declarados no DTO
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.nodeEnv !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('API de Agendamento')
        .setDescription(
          'Plataforma de agendamento com integração ao Google Calendar. ' +
            'A autenticação usa cookie HttpOnly; mutações exigem o header x-csrf-token.',
        )
        .setVersion('1.0')
        .addCookieAuth('agenda_session')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
