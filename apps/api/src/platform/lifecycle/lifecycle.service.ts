import {
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../../env';

@Injectable()
export class LifecycleService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(LifecycleService.name);

  private activeRequests = 0;

  private draining = false;

  public constructor(
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public beginRequest(): boolean {
    if (this.draining) {
      return false;
    }

    this.activeRequests += 1;
    return true;
  }

  public endRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }

  public isReady(): boolean {
    return !this.draining;
  }

  public async beforeApplicationShutdown(): Promise<void> {
    this.draining = true;
    const deadline = Date.now() + this.config.getOrThrow('SHUTDOWN_TIMEOUT_MS');

    while (this.activeRequests > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (this.activeRequests > 0) {
      this.logger.error('Graceful shutdown timed out with active requests.');
      throw new Error('Graceful shutdown timed out.');
    }
  }
}
