import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import {
  closeRedisClient,
  createRedisClient,
  withTimeout,
} from '@ecosuitability/runtime-utils';
import type { WorkerEnvironment } from '../env';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: RedisClientType;

  public constructor(
    config: ConfigService<WorkerEnvironment, true>,
    private readonly logger: Logger,
  ) {
    this.client = createRedisClient(config.getOrThrow('REDIS_URL'), (error) => {
      this.logger.error({ error }, 'Redis client error.');
    });
  }

  public async onModuleInit(): Promise<void> {
    try {
      await withTimeout(
        this.client.connect(),
        5000,
        'Redis operation timed out.',
      );
      await withTimeout(this.client.ping(), 5000, 'Redis operation timed out.');
    } catch (error) {
      this.logger.error({ error }, 'Redis startup check failed.');
      await closeRedisClient(this.client, 5000, 'Redis operation timed out.');

      throw new Error('Redis is unavailable during startup.');
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await closeRedisClient(this.client, 5000, 'Redis operation timed out.');
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
}
