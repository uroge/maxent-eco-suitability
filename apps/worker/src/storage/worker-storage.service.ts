import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { presignS3Get, presignS3Put } from '@ecosuitability/runtime-utils';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkerEnvironment } from '../env';
import type { Readable } from 'node:stream';

@Injectable()
export class WorkerStorageService {
  private readonly client: S3Client;

  private readonly capabilityClient: S3Client;

  private readonly bucket: string;

  public constructor(config: ConfigService<WorkerEnvironment, true>) {
    const internalEndpoint = config.getOrThrow('STORAGE_INTERNAL_ENDPOINT');
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
      endpoint: internalEndpoint,
    });
    this.capabilityClient = new S3Client({
      ...clientOptions,
      endpoint: config.get('STORAGE_CAPABILITY_ENDPOINT') ?? internalEndpoint,
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

  public async getStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error('Stored result artifact has no body.');
    }
    return response.Body as Readable;
  }

  public async putStream(
    key: string,
    body: Readable,
    contentType: string,
    contentDisposition: string,
    sha256: string,
  ): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentDisposition: contentDisposition,
        Metadata: { sha256 },
      },
    }).done();
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
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.$metadata.httpStatusCode === 404 || error.name === 'NotFound')
      ) {
        return undefined;
      }
      throw error;
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  public async presignGet(key: string, expiresIn: number): Promise<string> {
    return presignS3Get(this.capabilityClient, this.bucket, key, expiresIn);
  }

  public async presignPut(
    key: string,
    expiresIn: number,
    contentType: string,
    contentDisposition: string,
    sha256: string,
  ): Promise<string> {
    return presignS3Put(
      this.capabilityClient,
      this.bucket,
      key,
      expiresIn,
      contentType,
      contentDisposition,
      sha256,
    );
  }
}
