import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AnalysisRepository } from './analysis.repository';

const sweepIntervalMs = 60_000;

@Injectable()
export class AnalysisExpiryService
  implements OnModuleInit, OnApplicationShutdown
{
  private interval: NodeJS.Timeout | undefined;

  public constructor(
    private readonly repository: AnalysisRepository,
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

  public async expireDue(now = new Date()): Promise<void> {
    try {
      await this.repository.expireDue(now);
    } catch (error) {
      this.logger.error({ error }, 'Analysis expiry sweep failed.');
    }
  }
}
