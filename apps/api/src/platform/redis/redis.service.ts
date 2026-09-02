import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { withTimeout } from '@ecosuitability/runtime-utils';
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
      await withTimeout(
        this.client.connect(),
        5000,
        'Redis operation timed out.',
      );
      await withTimeout(this.client.ping(), 5000, 'Redis operation timed out.');
      await this.validateDurability();
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
      try {
        await withTimeout(
          this.client.close(),
          5000,
          'Redis operation timed out.',
        );
      } catch {
        if (this.client.isOpen) {
          this.client.destroy();
        }
      }
    }
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
