import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { WorkerEnvironment } from './env';
import { AppModule } from './app.module';
import { OperationsExceptionFilter } from './platform/operations-exception.filter';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<WorkerEnvironment, true>);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  app.use(helmet());
  app.useGlobalFilters(app.get(OperationsExceptionFilter));
  await app.listen(config.getOrThrow('WORKER_OPERATIONS_PORT'), '0.0.0.0');
};

void bootstrap();
