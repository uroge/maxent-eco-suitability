import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './env';
import { AuthModule } from './platform/auth/auth.module';
import { ContextModule } from './platform/context/context.module';
import { ErrorsModule } from './platform/errors/errors.module';
import { HealthModule } from './platform/health/health.module';
import { LoggingModule } from './platform/logging/logging.module';
import { LifecycleModule } from './platform/lifecycle/lifecycle.module';
import { MetricsModule } from './platform/metrics/metrics.module';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module';
import { RedisModule } from './platform/redis/redis.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),
    ContextModule,
    LoggingModule,
    LifecycleModule,
    ErrorsModule,
    RedisModule,
    AuthModule,
    RateLimitModule,
    HealthModule,
    MetricsModule,
    AnalysisModule,
  ],
})
export class AppModule {}
