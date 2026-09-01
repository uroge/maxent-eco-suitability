import { Injectable } from '@nestjs/common';
import type { UploadDataset } from '@ecosuitability/contracts';
import { RedisService } from '../platform/redis/redis.service';
import {
  AbortDatasetScript,
  CompleteDatasetScript,
  CompleteFileScript,
  CreateDatasetScript,
  RegisterFileScript,
} from './analysis-scripts';
import type { DatasetSession, UploadSession } from '../storage/storage.types';

const datasetKeyPrefix = 'ecosuitability:upload-dataset:';

const uploadKeyPrefix = 'ecosuitability:upload:';

const idempotencyKeyPrefix = 'ecosuitability:upload-dataset:idempotency:';

const expiryIndexKey = 'ecosuitability:upload-dataset:expiry';

type CreateResult = { dataset: DatasetSession; replayed: boolean } | 'conflict';

@Injectable()
export class DatasetRepository {
  public constructor(private readonly redis: RedisService) {}

  public async create(
    dataset: DatasetSession,
    ttlSeconds: number,
  ): Promise<CreateResult> {
    const result = (await this.redis.getClient().eval(CreateDatasetScript, {
      keys: [
        datasetKeyPrefix,
        this.idempotencyKey(
          dataset.ownerId,
          dataset.analysisId,
          dataset.idempotencyKey,
        ),
        expiryIndexKey,
      ],
      arguments: [
        dataset.id,
        dataset.fingerprint,
        JSON.stringify(dataset),
        String(ttlSeconds),
        String(new Date(dataset.expiresAt).getTime()),
      ],
    })) as string[];

    if (result[0] === 'conflict') {
      return 'conflict';
    }

    return {
      dataset: JSON.parse(result[1]) as DatasetSession,
      replayed: result[0] === 'replay',
    };
  }

  public async findOwned(
    analysisId: string,
    datasetId: string,
    ownerId: string,
  ): Promise<DatasetSession | undefined> {
    const payload = await this.redis
      .getClient()
      .get(this.datasetKey(datasetId));
    if (!payload) {
      return undefined;
    }

    const dataset = JSON.parse(payload) as DatasetSession;
    return dataset.analysisId === analysisId && dataset.ownerId === ownerId
      ? dataset
      : undefined;
  }

  public async findUploadOwned(
    analysisId: string,
    datasetId: string,
    uploadId: string,
    ownerId: string,
  ): Promise<UploadSession | undefined> {
    const payload = await this.redis.getClient().get(this.uploadKey(uploadId));
    if (!payload) {
      return undefined;
    }

    const upload = JSON.parse(payload) as UploadSession;
    return upload.analysisId === analysisId &&
      upload.datasetId === datasetId &&
      upload.ownerId === ownerId
      ? upload
      : undefined;
  }

  public async registerFile(
    dataset: DatasetSession,
    upload: UploadSession,
    shapefileBasename: string | undefined,
    ttlSeconds: number,
  ): Promise<
    | UploadSession
    | 'missing'
    | 'invalid'
    | 'invalid_basename'
    | 'duplicate_component'
  > {
    const result = (await this.redis.getClient().eval(RegisterFileScript, {
      keys: [this.datasetKey(dataset.id), uploadKeyPrefix],
      arguments: [
        dataset.ownerId,
        dataset.analysisId,
        upload.component ?? '',
        shapefileBasename ?? '',
        upload.id,
        new Date().toISOString(),
        JSON.stringify(upload),
        String(ttlSeconds),
      ],
    })) as string[];

    if (result[0] !== 'created') {
      return result[0] as
        'missing' | 'invalid' | 'invalid_basename' | 'duplicate_component';
    }

    return JSON.parse(result[1]) as UploadSession;
  }

  public async completeFile(
    upload: UploadSession,
  ): Promise<UploadSession | 'missing' | 'invalid'> {
    const result = (await this.redis.getClient().eval(CompleteFileScript, {
      keys: [this.uploadKey(upload.id)],
      arguments: [upload.ownerId, upload.analysisId, upload.datasetId],
    })) as string[];

    if (result[0] !== 'completed') {
      return result[0] as 'missing' | 'invalid';
    }

    return JSON.parse(result[1]) as UploadSession;
  }

  public async completeDataset(
    dataset: DatasetSession,
    requiredComponents: string[],
  ): Promise<DatasetSession | 'missing' | 'invalid' | 'incomplete'> {
    const result = (await this.redis.getClient().eval(CompleteDatasetScript, {
      keys: [this.datasetKey(dataset.id), uploadKeyPrefix],
      arguments: [
        dataset.ownerId,
        dataset.analysisId,
        JSON.stringify(requiredComponents),
        new Date().toISOString(),
      ],
    })) as string[];

    if (result[0] !== 'ready') {
      return result[0] as 'missing' | 'invalid' | 'incomplete';
    }

    return JSON.parse(result[1]) as DatasetSession;
  }

  public async abortDataset(
    dataset: DatasetSession,
  ): Promise<DatasetSession | 'missing'> {
    const result = (await this.redis.getClient().eval(AbortDatasetScript, {
      keys: [this.datasetKey(dataset.id)],
      arguments: [
        dataset.ownerId,
        dataset.analysisId,
        new Date().toISOString(),
      ],
    })) as string[];

    if (result[0] === 'missing') {
      return 'missing';
    }

    return JSON.parse(result[1]) as DatasetSession;
  }

  public async deleteDataset(dataset: DatasetSession): Promise<void> {
    await this.redis
      .getClient()
      .multi()
      .del(this.datasetKey(dataset.id))
      .del(
        this.idempotencyKey(
          dataset.ownerId,
          dataset.analysisId,
          dataset.idempotencyKey,
        ),
      )
      .zRem(expiryIndexKey, dataset.id)
      .exec();
  }

  public async deleteUpload(uploadId: string): Promise<void> {
    await this.redis.getClient().del(this.uploadKey(uploadId));
  }

  public async due(now: Date): Promise<DatasetSession[]> {
    const ids = await this.redis
      .getClient()
      .zRangeByScore(expiryIndexKey, 0, now.getTime(), {
        LIMIT: { offset: 0, count: 100 },
      });
    const records = await Promise.all(ids.map(async (id) => this.get(id)));
    return records.filter((record): record is DatasetSession =>
      Boolean(record),
    );
  }

  public async uploads(dataset: DatasetSession): Promise<UploadSession[]> {
    const records = await Promise.all(
      dataset.uploadIds.map(async (id) => this.getUpload(id)),
    );
    return records.filter((record): record is UploadSession => Boolean(record));
  }

  public publicDataset(dataset: DatasetSession): UploadDataset {
    return {
      id: dataset.id,
      analysisId: dataset.analysisId,
      kind: dataset.kind,
      format: dataset.format,
      status: dataset.status,
      createdAt: dataset.createdAt,
      expiresAt: dataset.expiresAt,
    };
  }

  private async get(datasetId: string): Promise<DatasetSession | undefined> {
    const payload = await this.redis
      .getClient()
      .get(this.datasetKey(datasetId));
    return payload ? (JSON.parse(payload) as DatasetSession) : undefined;
  }

  private async getUpload(
    uploadId: string,
  ): Promise<UploadSession | undefined> {
    const payload = await this.redis.getClient().get(this.uploadKey(uploadId));
    return payload ? (JSON.parse(payload) as UploadSession) : undefined;
  }

  private datasetKey(datasetId: string): string {
    return `${datasetKeyPrefix}${datasetId}`;
  }

  private uploadKey(uploadId: string): string {
    return `${uploadKeyPrefix}${uploadId}`;
  }

  private idempotencyKey(
    ownerId: string,
    analysisId: string,
    key: string,
  ): string {
    return `${idempotencyKeyPrefix}${ownerId}:${analysisId}:${key}`;
  }
}
