import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { ApiEnvironment } from './env';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const logger = app.get(Logger);
  const express = app.getHttpAdapter().getInstance();

  app.useLogger(logger);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  express.set('trust proxy', config.getOrThrow('TRUST_PROXY_CIDRS'));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: config.getOrThrow('API_CORS_ORIGINS'),
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalFilters(app.get(ApiExceptionFilter));

  if (config.getOrThrow('APP_ENV') !== 'production') {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('EcoSuitability API')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  await app.listen(config.getOrThrow('PORT'), '0.0.0.0');
};

void bootstrap();
