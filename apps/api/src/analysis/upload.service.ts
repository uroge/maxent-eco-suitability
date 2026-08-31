import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { CompletedPart } from '@aws-sdk/client-s3';
import type {
  CompleteUploadRequest,
  CreateUploadDatasetRequest,
  Principal,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { RedisService } from '../platform/redis/redis.service';
import { StorageService } from '../storage/storage.service';
import type { UploadSession } from '../storage/storage.types';
import { AnalysisService } from './analysis.service';

const sessionTtlSeconds = 60 * 60;

const multipartThresholdBytes = 64 * 1024 * 1024;

const partSizeBytes = 16 * 1024 * 1024;

@Injectable()
export class UploadService {
  public constructor(
    private readonly analysisService: AnalysisService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  public async createDataset(
    principal: Principal,
    analysisId: string,
    request: CreateUploadDatasetRequest,
  ): Promise<{
    datasetId: string;
    files: Array<{ uploadId: string; url: string; multipart: boolean }>;
  }> {
    const analysis = await this.analysisService.find(principal, analysisId);
    if (analysis.status !== 'draft') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis cannot accept uploads in its current state.',
      );
    }

    this.validateDataset(request);
    const datasetId = this.id('ds');
    const files = await Promise.all(
      request.files.map(async (file, index) => {
        const uploadId = this.id('up');
        const objectKey = `analyses/${analysisId}/inputs/${datasetId}/${this.objectSuffix(request.format, file.component, index)}`;
        const multipart = file.size >= multipartThresholdBytes;
        const multipartUploadId = multipart
          ? await this.storage.createMultipart(objectKey, file.contentType)
          : undefined;
        const session: UploadSession = {
          id: uploadId,
          datasetId,
          analysisId,
          ownerId: principal.userId,
          objectKey,
          originalName: this.safeName(file.originalName),
          size: file.size,
          sha256: file.sha256.toLowerCase(),
          contentType: file.contentType,
          format: request.format,
          kind: request.kind,
          multipartUploadId,
          status: 'pending',
        };
        const created = await this.redis
          .getClient()
          .set(this.key(uploadId), JSON.stringify(session), {
            EX: sessionTtlSeconds,
            NX: true,
          });
        if (created !== 'OK') {
          throw new ApiException(
            503,
            'DEPENDENCY_UNAVAILABLE',
            'Upload coordination is unavailable.',
          );
        }

        return {
          uploadId,
          url: multipart
            ? ''
            : await this.storage.presignPut(objectKey, file.contentType),
          multipart,
        };
      }),
    );

    return { datasetId, files };
  }

  public async parts(
    principal: Principal,
    analysisId: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<Array<{ partNumber: number; url: string }>> {
    const session = await this.session(principal, analysisId, uploadId);
    if (
      !session.multipartUploadId ||
      partNumbers.length === 0 ||
      partNumbers.length > 20
    ) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }

    const maxParts = Math.ceil(session.size / partSizeBytes);
    if (
      partNumbers.some(
        (partNumber) =>
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > maxParts,
      )
    ) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }

    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignPart(
          session.objectKey,
          session.multipartUploadId!,
          partNumber,
        ),
      })),
    );
  }

  public async complete(
    principal: Principal,
    analysisId: string,
    uploadId: string,
    request: CompleteUploadRequest,
  ): Promise<void> {
    const session = await this.session(principal, analysisId, uploadId);
    if (session.status === 'completed') {
      return;
    }

    if (session.multipartUploadId) {
      const parts: CompletedPart[] = request.parts.map((part) => ({
        PartNumber: part.partNumber,
        ETag: part.etag,
      }));
      if (
        parts.length === 0 ||
        new Set(parts.map((part) => part.PartNumber)).size !== parts.length
      ) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'The request is invalid.',
        );
      }

      await this.storage.completeMultipart(
        session.objectKey,
        session.multipartUploadId,
        parts,
      );
    }

    const object = await this.storage.head(session.objectKey);
    if (!object || object.size !== session.size) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The uploaded file could not be verified.',
      );
    }

    session.status = 'completed';
    await this.redis
      .getClient()
      .set(this.key(uploadId), JSON.stringify(session), {
        EX: sessionTtlSeconds,
        XX: true,
      });
  }

  public async abort(
    principal: Principal,
    analysisId: string,
    uploadId: string,
  ): Promise<void> {
    const session = await this.session(principal, analysisId, uploadId);
    if (session.multipartUploadId && session.status === 'pending') {
      await this.storage.abortMultipart(
        session.objectKey,
        session.multipartUploadId,
      );
    }

    await this.storage.delete(session.objectKey);
    await this.redis.getClient().del(this.key(uploadId));
  }

  private async session(
    principal: Principal,
    analysisId: string,
    uploadId: string,
  ): Promise<UploadSession> {
    const raw = await this.redis.getClient().get(this.key(uploadId));
    const session = raw ? (JSON.parse(raw) as UploadSession) : undefined;
    if (
      !session ||
      session.ownerId !== principal.userId ||
      session.analysisId !== analysisId
    ) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'The requested resource was not found.',
      );
    }

    return session;
  }

  private validateDataset(request: CreateUploadDatasetRequest): void {
    const files = request.files;
    const allowed =
      request.kind === 'occurrence'
        ? ['csv', 'xlsx', 'geojson', 'shapefile']
        : ['geotiff'];
    const limit =
      request.format === 'geotiff' ? 2 * 1024 * 1024 * 1024 : 100 * 1024 * 1024;
    if (
      !allowed.includes(request.format) ||
      files.reduce((total, file) => total + file.size, 0) > limit
    ) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }

    if (request.format === 'shapefile') {
      const components = files.map((file) => file.component);
      if (
        !['shp', 'shx', 'dbf'].every((component) =>
          components.includes(component as never),
        ) ||
        new Set(components).size !== components.length
      ) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'The request is invalid.',
        );
      }
    } else if (files.length !== 1 || files[0].component) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }
  }

  private objectSuffix(
    format: string,
    component: string | undefined,
    index: number,
  ): string {
    return format === 'shapefile' ? `shapefile/${component}` : `file-${index}`;
  }

  private safeName(name: string): string {
    return name
      .replace(/[\\/\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 255);
  }

  private id(prefix: string): string {
    return `${prefix}_${randomBytes(16).toString('hex')}`;
  }

  private key(uploadId: string): string {
    return `ecosuitability:upload:${uploadId}`;
  }
}
