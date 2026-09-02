import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { StorageService } from '../storage/storage.service';
import { AnalysisRepository } from './analysis.repository';

const sweepIntervalMs = 60_000;

@Injectable()
export class AnalysisCleanupService
  implements OnModuleInit, OnApplicationShutdown
{
  private interval: NodeJS.Timeout | undefined;

  public constructor(
    private readonly repository: AnalysisRepository,
    private readonly storage: StorageService,
    private readonly logger: Logger,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.reconcile();
    this.interval = setInterval(() => {
      void this.reconcile();
    }, sweepIntervalMs);
  }

  public onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  public async reconcile(now = new Date()): Promise<void> {
    const records = await this.repository.dueCleanup(now);
    await Promise.all(
      records.map(async (record) => {
        const claimed = await this.repository.claimCleanup(record.id, now);
        if (!claimed) {
          return;
        }

        try {
          await Promise.all(
            claimed.objectKeys.map(async (key) => this.storage.delete(key)),
          );
          await Promise.all(
            claimed.multipartUploads.map(async (upload) =>
              this.storage.cleanupUpload(upload.key, upload.uploadId),
            ),
          );
          await this.repository.completeCleanup(claimed.id);
        } catch (error) {
          this.logger.warn(
            { error, cleanupId: claimed.id },
            'Analysis storage cleanup will be retried.',
          );
          await this.repository.retryCleanup(claimed, now);
        }
      }),
    );
  }
}
