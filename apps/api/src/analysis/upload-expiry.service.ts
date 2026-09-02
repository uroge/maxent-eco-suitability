import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { UploadService } from './upload.service';

const sweepIntervalMs = 60_000;

@Injectable()
export class UploadExpiryService
  implements OnModuleInit, OnApplicationShutdown
{
  private interval: NodeJS.Timeout | undefined;

  public constructor(
    private readonly uploadService: UploadService,
    private readonly logger: Logger,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.expireDue();
    this.interval = setInterval(() => {
      void this.expireDue();
    }, sweepIntervalMs);
  }

  public onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async expireDue(): Promise<void> {
    try {
      await this.uploadService.expireDue();
    } catch (error) {
      this.logger.error({ error }, 'Upload session expiry sweep failed.');
    }
  }
}
