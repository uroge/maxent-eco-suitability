import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import type { WorkerEnvironment } from '../env';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: RedisClientType;

  public constructor(
    config: ConfigService<WorkerEnvironment, true>,
    private readonly logger: Logger,
  ) {
    this.client = createClient({
      url: config.getOrThrow('REDIS_URL'),
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
      },
      disableOfflineQueue: true,
    });
    this.client.on('error', (error) => {
      this.logger.error({ error }, 'Redis client error.');
    });
  }

  public async onModuleInit(): Promise<void> {
    try {
      await this.withTimeout(this.client.connect());
      await this.withTimeout(this.client.ping());
    } catch (error) {
      this.logger.error({ error }, 'Redis startup check failed.');

      if (this.client.isOpen) {
        await this.client.close();
      }

      throw new Error('Redis is unavailable during startup.');
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }

  public async isReady(): Promise<boolean> {
    if (!this.client.isReady) {
      return false;
    }

    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  public getClient(): RedisClientType {
    return this.client;
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis operation timed out.')),
            5000,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
