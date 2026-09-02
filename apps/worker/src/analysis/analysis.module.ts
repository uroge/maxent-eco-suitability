import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  analysisQueueName,
  analysisQueuePrefix,
} from '@ecosuitability/contracts';
import type { WorkerEnvironment } from '../env';
import { WorkerStorageModule } from '../storage/worker-storage.module';
import { AnalysisProcessor } from './analysis.processor';
import { ResultService } from './result.service';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';

@Module({
  imports: [
    WorkerStorageModule,
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
  providers: [WorkerLifecycleRepository, ResultService, AnalysisProcessor],
})
export class AnalysisModule {}
