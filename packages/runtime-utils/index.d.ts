import type { S3Client } from '@aws-sdk/client-s3';
import type { RedisClientType } from 'redis';

export declare const withTimeout: <T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
) => Promise<T>;

export declare const resolveRequestId: (incomingRequestId: string | undefined) => string;

export declare const constantTimeBearerTokenEquals: (
  authorization: string | undefined,
  expected: string
) => boolean;

export declare const canonicalizeJson: (value: unknown) => string;

export declare const loadLuaScript: (directory: string, filename: string) => string;

export declare const createRedisClient: (
  url: string,
  onError: (error: Error) => void
) => RedisClientType;

export declare const closeRedisClient: (
  client: RedisClientType,
  timeoutMs: number,
  message: string
) => Promise<void>;

export declare const presignS3Get: (
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number
) => Promise<string>;

export declare const completeOnResponseEnd: (
  response: {
    once: (event: 'finish' | 'close', listener: () => void) => unknown;
  },
  complete: () => void
) => void;
