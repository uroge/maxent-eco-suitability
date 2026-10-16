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
import type { ApiEnvironment } from '../../env';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: RedisClientType;

  private readonly durabilityMode: ApiEnvironment['REDIS_DURABILITY_MODE'];

  public constructor(
    config: ConfigService<ApiEnvironment, true>,
    private readonly logger: Logger,
  ) {
    this.durabilityMode = config.getOrThrow('REDIS_DURABILITY_MODE');
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
      await this.validateDurability();
    } catch (error) {
      this.logger.error({ error }, 'Redis startup check failed.');
      await closeRedisClient(this.client, 5000, 'Redis operation timed out.');

      throw new Error('Redis is unavailable during startup.');
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    await closeRedisClient(this.client, 5000, 'Redis operation timed out.');
  }

  public getClient(): RedisClientType {
    return this.client;
  }

  public async isReady(): Promise<boolean> {
    if (!this.client.isReady) {
      return false;
    }

    try {
      await this.client.ping();
      await this.validateDurability();
      return true;
    } catch {
      return false;
    }
  }

  private async validateDurability(): Promise<void> {
    if (this.durabilityMode === 'disabled') {
      return;
    }

    if (this.durabilityMode === 'managed') {
      return;
    }

    const values = await this.client.configGet([
      'appendonly',
      'appendfsync',
      'maxmemory-policy',
    ]);
    if (
      values.appendonly !== 'yes' ||
      values.appendfsync !== 'everysec' ||
      values['maxmemory-policy'] !== 'noeviction'
    ) {
      throw new Error('Redis durability requirements are not satisfied.');
    }
  }
}
