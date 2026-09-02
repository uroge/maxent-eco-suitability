import { Injectable } from '@nestjs/common';
import type {
  AnalysisInputDataset,
  UploadDataset,
} from '@ecosuitability/contracts';
import { RedisService } from '../platform/redis/redis.service';
import {
  AbortDatasetScript,
  AttachDatasetScript,
  CompleteDatasetScript,
  CompleteFileScript,
  CreateDatasetScript,
  MarkReadyScript,
  RegisterFileScript,
} from './analysis-scripts';
import type { DatasetSession, UploadSession } from '../storage/storage.types';

const datasetKeyPrefix = 'ecosuitability:upload-dataset:';

const uploadKeyPrefix = 'ecosuitability:upload:';

const idempotencyKeyPrefix = 'ecosuitability:upload-dataset:idempotency:';

const expiryIndexKey = 'ecosuitability:upload-dataset:expiry';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const analysisInputsKeyPrefix = 'ecosuitability:analysis-inputs:';

const analysisSessionsKeyPrefix = 'ecosuitability:analysis-upload-sessions:';

type CreateResult = { dataset: DatasetSession; replayed: boolean } | 'conflict';

@Injectable()
export class DatasetRepository {
  public constructor(private readonly redis: RedisService) {}

  public async create(
    dataset: DatasetSession,
    ttlSeconds: number,
  ): Promise<
    CreateResult | 'missing' | 'invalid_analysis' | 'occurrence_reserved'
  > {
    const result = (await this.redis.getClient().eval(CreateDatasetScript, {
      keys: [
        datasetKeyPrefix,
        this.idempotencyKey(
          dataset.ownerId,
          dataset.analysisId,
          dataset.idempotencyKey,
        ),
        expiryIndexKey,
        this.analysisKey(dataset.analysisId),
        this.analysisSessionsKey(dataset.analysisId),
      ],
      arguments: [
        dataset.id,
        dataset.fingerprint,
        JSON.stringify(dataset),
        String(ttlSeconds),
        String(new Date(dataset.expiresAt).getTime()),
        dataset.ownerId,
        new Date().toISOString(),
        dataset.kind,
      ],
    })) as string[];

    if (
      result[0] === 'conflict' ||
      result[0] === 'missing' ||
      result[0] === 'invalid_analysis' ||
      result[0] === 'occurrence_reserved'
    ) {
      return result[0];
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

  public async claimCompletion(
    dataset: DatasetSession,
    requiredComponents: string[],
    claimId: string,
    claimExpiresAt: string,
  ): Promise<
    | DatasetSession
    | 'missing'
    | 'invalid'
    | 'invalid_analysis'
    | 'incomplete'
    | 'claimed'
  > {
    const result = (await this.redis.getClient().eval(CompleteDatasetScript, {
      keys: [
        this.datasetKey(dataset.id),
        uploadKeyPrefix,
        this.analysisKey(dataset.analysisId),
      ],
      arguments: [
        dataset.ownerId,
        dataset.analysisId,
        JSON.stringify(requiredComponents),
        claimId,
        new Date().toISOString(),
        claimExpiresAt,
      ],
    })) as string[];

    if (result[0] !== 'claimed' || !result[1]) {
      return result[0] as
        'missing' | 'invalid' | 'invalid_analysis' | 'incomplete' | 'claimed';
    }

    return JSON.parse(result[1]) as DatasetSession;
  }

  public async attach(
    dataset: DatasetSession,
    claimId: string,
    attached: AnalysisInputDataset,
  ): Promise<
    | UploadDataset
    | 'missing'
    | 'invalid'
    | 'invalid_analysis'
    | 'occurrence_taken'
  > {
    const result = (await this.redis.getClient().eval(AttachDatasetScript, {
      keys: [
        this.datasetKey(dataset.id),
        this.analysisKey(dataset.analysisId),
        this.analysisInputsKey(dataset.analysisId),
        this.idempotencyKey(
          dataset.ownerId,
          dataset.analysisId,
          dataset.idempotencyKey,
        ),
        expiryIndexKey,
        uploadKeyPrefix,
        this.analysisSessionsKey(dataset.analysisId),
      ],
      arguments: [
        dataset.ownerId,
        dataset.analysisId,
        claimId,
        JSON.stringify(attached),
      ],
    })) as string[];

    if (result[0] !== 'attached') {
      return result[0] as
        'missing' | 'invalid' | 'invalid_analysis' | 'occurrence_taken';
    }

    return JSON.parse(result[1]) as UploadDataset;
  }

  public async abortDataset(
    dataset: DatasetSession,
  ): Promise<DatasetSession | 'missing'> {
    const result = (await this.redis.getClient().eval(AbortDatasetScript, {
      keys: [
        this.datasetKey(dataset.id),
        this.analysisKey(dataset.analysisId),
        this.analysisSessionsKey(dataset.analysisId),
      ],
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
      .sRem(this.analysisSessionsKey(dataset.analysisId), dataset.id)
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

  public async attached(
    analysisId: string,
    datasetId: string,
  ): Promise<AnalysisInputDataset | undefined> {
    const manifest = await this.manifest(analysisId);
    return manifest.datasets.find(
      (dataset) => dataset.dataset.id === datasetId,
    );
  }

  public async manifest(
    analysisId: string,
  ): Promise<{ datasets: AnalysisInputDataset[] }> {
    const payload = await this.redis
      .getClient()
      .get(this.analysisInputsKey(analysisId));
    return payload
      ? (JSON.parse(payload) as { datasets: AnalysisInputDataset[] })
      : { datasets: [] };
  }

  public async markReady(
    analysisId: string,
    ownerId: string,
  ): Promise<
    { status: 'ready'; analysis: string } | 'missing' | 'invalid' | 'incomplete'
  > {
    const result = (await this.redis.getClient().eval(MarkReadyScript, {
      keys: [this.analysisKey(analysisId), this.analysisInputsKey(analysisId)],
      arguments: [ownerId, new Date().toISOString()],
    })) as string[];

    if (result[0] !== 'ready') {
      return result[0] as 'missing' | 'invalid' | 'incomplete';
    }

    return { status: 'ready', analysis: result[1] };
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

  private analysisKey(analysisId: string): string {
    return `${analysisKeyPrefix}${analysisId}`;
  }

  private analysisInputsKey(analysisId: string): string {
    return `${analysisInputsKeyPrefix}${analysisId}`;
  }

  private analysisSessionsKey(analysisId: string): string {
    return `${analysisSessionsKeyPrefix}${analysisId}`;
  }
}
