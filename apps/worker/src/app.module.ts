import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AnalysisModule } from './analysis/analysis.module';
import { validateEnvironment } from './env';
import { OperationsController } from './platform/operations.controller';
import { OperationsExceptionFilter } from './platform/operations-exception.filter';
import { LifecycleModule } from './platform/lifecycle.module';
import { LifecycleMiddleware } from './platform/lifecycle.middleware';
import { RedisModule } from './platform/redis.module';
import { RequestIdMiddleware } from './platform/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
          ],
          censor: '[REDACTED]',
        },
        serializers: {
          req: () => undefined,
          res: () => undefined,
        },
      },
    }),
    LifecycleModule,
    RedisModule,
    AnalysisModule,
  ],
  controllers: [OperationsController],
  providers: [
    OperationsExceptionFilter,
    LifecycleMiddleware,
    RequestIdMiddleware,
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LifecycleMiddleware).forRoutes('*');
  }
}
