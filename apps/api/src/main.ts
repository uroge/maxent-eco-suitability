import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { ApiEnvironment } from './env';
import { AppModule } from './app.module';
import { configureApiApplication } from './configure-api-application';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });
  const config = app.get(ConfigService<ApiEnvironment, true>);
  const logger = app.get(Logger);

  app.useLogger(logger);
  await configureApiApplication(app);

  await app.listen(config.getOrThrow('PORT'), '0.0.0.0');
};

void bootstrap();
