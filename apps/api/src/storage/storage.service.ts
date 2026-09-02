import {
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  S3Client,
  type CompletedPart,
  UploadPartCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { ApiEnvironment } from '../env';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly provider: ApiEnvironment['STORAGE_PROVIDER'];
  private readonly corsOrigins: string[];

  public constructor(config: ConfigService<ApiEnvironment, true>) {
    const clientOptions = {
      region: config.getOrThrow('STORAGE_REGION'),
      forcePathStyle: config.getOrThrow('STORAGE_FORCE_PATH_STYLE'),
      credentials: {
        accessKeyId: config.getOrThrow('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow('STORAGE_SECRET_ACCESS_KEY'),
      },
    };

    this.client = new S3Client({
      ...clientOptions,
      endpoint: config.getOrThrow('STORAGE_INTERNAL_ENDPOINT'),
    });
    this.presignClient = new S3Client({
      ...clientOptions,
      endpoint: config.getOrThrow('STORAGE_PRESIGN_ENDPOINT'),
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.bucket = config.getOrThrow('STORAGE_BUCKET');
    this.provider = config.getOrThrow('STORAGE_PROVIDER');
    this.corsOrigins = config.getOrThrow('STORAGE_CORS_ORIGINS');
  }

  public async onModuleInit(): Promise<void> {
    await this.bootstrap();
  }

  public async bootstrap(): Promise<void> {
    if (this.provider !== 'seaweedfs') {
      return;
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch {
      // Creating an already existing development bucket is expected.
    }

    await this.client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: this.corsOrigins,
              AllowedMethods: ['PUT', 'HEAD'],
              AllowedHeaders: ['content-type', 'x-amz-*'],
              ExposeHeaders: ['ETag', 'x-amz-checksum-sha256'],
              MaxAgeSeconds: 600,
            },
          ],
        },
      }),
    );
    await this.waitForWritableSeaweedFs();
  }

  public async createMultipart(
    key: string,
    contentType: string | undefined,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
    );
    if (!response.UploadId) {
      throw new Error('Storage did not return a multipart upload ID.');
    }

    return response.UploadId;
  }

  public async presignPut(
    key: string,
    contentType: string | undefined,
  ): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 900 },
    );
  }

  public async presignPart(
    key: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 900 },
    );
  }

  public async completeMultipart(
    key: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }

  public async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  public async head(key: string): Promise<{ size: number } | undefined> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: response.ContentLength ?? 0 };
    } catch {
      return undefined;
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  public async cleanupUpload(
    key: string,
    multipartUploadId: string | undefined,
  ): Promise<void> {
    let failure: unknown;
    if (multipartUploadId) {
      try {
        await this.abortMultipart(key, multipartUploadId);
      } catch (error) {
        failure = error;
      }
    }

    try {
      await this.delete(key);
    } catch (error) {
      failure ??= error;
    }

    if (failure) {
      throw failure;
    }
  }

  public async isReady(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  private async waitForWritableSeaweedFs(): Promise<void> {
    const probeKey = `.ecosuitability-bootstrap/${randomUUID()}`;
    let lastError: unknown;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: probeKey,
            Body: new Uint8Array(),
          }),
        );
        await this.delete(probeKey);
        return;
      } catch (error) {
        lastError = error;
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 250);
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('SeaweedFS is not writable during startup.');
  }
}
