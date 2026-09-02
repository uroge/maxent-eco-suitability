import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import {
  analysisQueueName,
  analysisQueuePrefix,
} from '@ecosuitability/contracts';
import type { ApiEnvironment } from '../env';
import { AuthModule } from '../platform/auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisCleanupService } from './analysis-cleanup.service';
import { AnalysisExpiryService } from './analysis-expiry.service';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';
import { AnalysisQueueService } from './analysis-queue.service';
import { DatasetRepository } from './dataset.repository';
import { UploadController } from './upload.controller';
import { UploadExpiryService } from './upload-expiry.service';
import { UploadService } from './upload.service';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => {
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
  controllers: [AnalysisController, UploadController],
  providers: [
    AnalysisRepository,
    AnalysisService,
    AnalysisQueueService,
    AnalysisExpiryService,
    AnalysisCleanupService,
    DatasetRepository,
    UploadService,
    UploadExpiryService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
