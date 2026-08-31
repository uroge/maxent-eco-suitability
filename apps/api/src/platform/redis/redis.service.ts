import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import type { ApiEnvironment } from '../../env';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: RedisClientType;

  public constructor(config: ConfigService<ApiEnvironment, true>) {
    this.client = createClient({
      url: config.getOrThrow('REDIS_URL'),
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 2000),
      },
      disableOfflineQueue: true,
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.client.ping();
  }

  public async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
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
      return true;
    } catch {
      return false;
    }
  }
}
