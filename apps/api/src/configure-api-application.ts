import { ConfigService } from '@nestjs/config';
import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Server } from 'node:http';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter';
import { RequestIdMiddleware } from './platform/context/request-id.middleware';
import type { ApiEnvironment } from './env';

export const configureApiApplication = async (
  app: NestExpressApplication,
): Promise<void> => {
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const express = app.getHttpAdapter().getInstance();
  const requestIdMiddleware = app.get(RequestIdMiddleware);

  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // This runs before parsing so malformed and oversized bodies receive an ID too.
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.useBodyParser('json', {
    limit: config.getOrThrow('MAX_JSON_BODY_BYTES'),
  });
  express.set('trust proxy', config.getOrThrow('TRUST_PROXY_CIDRS'));
  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow('API_CORS_ORIGINS'),
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalFilters(app.get(ApiExceptionFilter));

  const server = app.getHttpServer() as Server;
  server.headersTimeout = config.getOrThrow('HTTP_HEADERS_TIMEOUT_MS');
  server.requestTimeout = config.getOrThrow('HTTP_REQUEST_TIMEOUT_MS');
  server.keepAliveTimeout = config.getOrThrow('HTTP_KEEP_ALIVE_TIMEOUT_MS');

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
};
