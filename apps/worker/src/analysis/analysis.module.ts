import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  analysisQueueName,
  analysisQueuePrefix,
} from '@ecosuitability/contracts';
import type { WorkerEnvironment } from '../env';
import { AnalysisProcessor } from './analysis.processor';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<WorkerEnvironment, true>) => {
        const redisUrl = new URL(config.getOrThrow('REDIS_URL'));
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            username: redisUrl.username || undefined,
            password: redisUrl.password || undefined,
            tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
          prefix: analysisQueuePrefix,
        };
      },
    }),
    BullModule.registerQueue({ name: analysisQueueName }),
  ],
  providers: [WorkerLifecycleRepository, AnalysisProcessor],
})
export class AnalysisModule {}
