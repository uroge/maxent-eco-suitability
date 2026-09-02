import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkerEnvironment } from '../env';

@Injectable()
export class LifecycleService implements BeforeApplicationShutdown {
  private activeRequests = 0;

  private activeJobs = 0;

  private draining = false;

  public constructor(
    private readonly config: ConfigService<WorkerEnvironment, true>,
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

  public beginJob(): boolean {
    if (this.draining) {
      return false;
    }

    this.activeJobs += 1;
    return true;
  }

  public endJob(): void {
    this.activeJobs = Math.max(0, this.activeJobs - 1);
  }

  public beginDraining(): void {
    this.draining = true;
  }

  public isReady(): boolean {
    return !this.draining;
  }

  public async beforeApplicationShutdown(): Promise<void> {
    this.beginDraining();
    await this.waitForDrain();
  }

  public async waitForDrain(): Promise<void> {
    const deadline = Date.now() + this.config.getOrThrow('SHUTDOWN_TIMEOUT_MS');

    while (
      (this.activeRequests > 0 || this.activeJobs > 0) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (this.activeRequests > 0 || this.activeJobs > 0) {
      throw new Error('Graceful shutdown timed out.');
    }
  }
}
