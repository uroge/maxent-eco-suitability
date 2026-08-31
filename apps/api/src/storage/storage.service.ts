import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
  type CompletedPart,
  UploadPartCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvironment } from '../env';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

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
    });
    this.bucket = config.getOrThrow('STORAGE_BUCKET');
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

  public async isReady(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
