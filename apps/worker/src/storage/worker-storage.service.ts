import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkerEnvironment } from '../env';

@Injectable()
export class WorkerStorageService {
  private readonly client: S3Client;

  private readonly bucket: string;

  public constructor(config: ConfigService<WorkerEnvironment, true>) {
    this.client = new S3Client({
      endpoint: config.getOrThrow('STORAGE_INTERNAL_ENDPOINT'),
      region: config.getOrThrow('STORAGE_REGION'),
      forcePathStyle: config.getOrThrow('STORAGE_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.getOrThrow('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow('STORAGE_SECRET_ACCESS_KEY'),
      },
    });
    this.bucket = config.getOrThrow('STORAGE_BUCKET');
  }

  public async put(
    key: string,
    body: Uint8Array,
    contentType: string,
    contentDisposition: string,
    sha256: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: contentDisposition,
        Metadata: { sha256 },
      }),
    );
  }

  public async head(key: string): Promise<
    | {
        size: number;
        contentType: string | undefined;
        contentDisposition: string | undefined;
        sha256: string | undefined;
      }
    | undefined
  > {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType,
        contentDisposition: response.ContentDisposition,
        sha256: response.Metadata?.sha256,
      };
    } catch {
      return undefined;
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
