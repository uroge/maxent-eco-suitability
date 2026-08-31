import { ConfigService } from '@nestjs/config';
import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { ApiEnvironment } from '../../env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.x-api-key',
  'res.headers.set-cookie',
  'CLERK_SECRET_KEY',
  'METRICS_TOKEN',
];

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => ({
        pinoHttp: {
          level: config.getOrThrow('LOG_LEVEL'),
          redact: { paths: redactPaths, censor: '[REDACTED]' },
          serializers: {
            req: () => undefined,
            res: () => undefined,
          },
          customProps: (request) => ({ requestId: request.id }),
          customSuccessMessage: () => 'request completed',
          customErrorMessage: () => 'request failed',
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
