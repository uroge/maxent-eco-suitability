import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CompletedPart } from '@aws-sdk/client-s3';
import type {
  Analysis,
  AnalysisInputDataset,
  AnalysisInputManifest,
  CompleteUploadRequest,
  CreateUploadDatasetRequest,
  CreateUploadFileRequest,
  IdempotencyKey,
  Principal,
  ShapefileComponent,
  UploadDataset,
  UploadFileResponse,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { StorageService } from '../storage/storage.service';
import type { DatasetSession, UploadSession } from '../storage/storage.types';
import { AnalysisService } from './analysis.service';
import { DatasetRepository } from './dataset.repository';

const sessionTtlSeconds = 60 * 60;

const multipartThresholdBytes = 64 * 1024 * 1024;

const partSizeBytes = 16 * 1024 * 1024;

const occurrenceLimitBytes = 100 * 1024 * 1024;

const predictorLimitBytes = 2 * 1024 * 1024 * 1024;

const predictorArchiveLimitBytes = 500 * 1024 * 1024;

const shapefileRequiredComponents: ShapefileComponent[] = ['shp', 'shx', 'dbf'];

const shapefileAllowedComponents: ShapefileComponent[] = [
  ...shapefileRequiredComponents,
  'prj',
  'cpg',
];

@Injectable()
export class UploadService {
  public constructor(
    private readonly analysisService: AnalysisService,
    private readonly repository: DatasetRepository,
    private readonly storage: StorageService,
  ) {}

  public async createDataset(
    principal: Principal,
    analysisId: string,
    idempotencyKey: IdempotencyKey,
    request: CreateUploadDatasetRequest,
  ): Promise<{ dataset: UploadDataset; replayed: boolean }> {
    this.validateKindAndFormat(request.kind, request.format);
    const now = new Date();
    const dataset: DatasetSession = {
      id: this.id('ds'),
      analysisId,
      ownerId: principal.userId,
      idempotencyKey,
      fingerprint: this.fingerprint(request),
      kind: request.kind,
      format: request.format,
      status: 'collecting',
      shapefileBasename: undefined,
      uploadIds: [],
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + sessionTtlSeconds * 1000,
      ).toISOString(),
      completionClaimId: undefined,
      completionClaimExpiresAt: undefined,
    };
    const result = await this.repository.create(dataset, sessionTtlSeconds);
    if (result === 'conflict') {
      throw this.conflict(
        'The idempotency key was already used for a different request.',
      );
    }

    if (result === 'occurrence_reserved') {
      throw this.conflict('The analysis already has an occurrence dataset.');
    }

    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'invalid_analysis') {
      throw this.conflict(
        'The analysis cannot accept uploads in its current state.',
      );
    }

    return {
      dataset: this.repository.publicDataset(result.dataset),
      replayed: result.replayed,
    };
  }

  public async addFile(
    principal: Principal,
    analysisId: string,
    datasetId: string,
    request: CreateUploadFileRequest,
  ): Promise<UploadFileResponse> {
    const dataset = await this.dataset(principal, analysisId, datasetId);
    if (dataset.status !== 'collecting') {
      throw this.conflict(
        'The dataset cannot accept files in its current state.',
      );
    }

    const component = this.validateFile(dataset, request);
    if (
      dataset.format === 'geotiff-zip' &&
      request.size > predictorArchiveLimitBytes
    ) {
      throw this.validationError('The GeoTIFF archive exceeds the size limit.');
    }
    const existingUploads = await this.repository.uploads(dataset);
    const existingUpload = existingUploads.find(
      (upload) =>
        upload.originalName === this.safeName(request.originalName) &&
        upload.size === request.size &&
        upload.sha256 === request.sha256.toLowerCase() &&
        upload.component === component,
    );
    if (existingUpload) {
      const multipart = Boolean(existingUpload.multipartUploadId);
      return {
        id: existingUpload.id,
        multipart,
        uploadUrl:
          multipart || existingUpload.status !== 'pending'
            ? null
            : await this.storage.presignPut(
                existingUpload.objectKey,
                existingUpload.contentType,
              ),
        partSizeBytes: multipart ? partSizeBytes : null,
      };
    }
    const totalSize =
      existingUploads.reduce((total, upload) => total + upload.size, 0) +
      request.size;
    if (totalSize > this.sizeLimit(dataset.kind)) {
      throw this.validationError();
    }

    const uploadId = this.id('up');
    const multipart = request.size >= multipartThresholdBytes;
    const objectKey = this.objectKey(dataset, uploadId, component);
    const multipartUploadId = multipart
      ? await this.storage.createMultipart(objectKey, request.contentType)
      : undefined;
    const upload: UploadSession = {
      id: uploadId,
      datasetId,
      analysisId,
      ownerId: principal.userId,
      objectKey,
      originalName: this.safeName(request.originalName),
      size: request.size,
      sha256: request.sha256.toLowerCase(),
      contentType: request.contentType,
      format: dataset.format,
      kind: dataset.kind,
      component,
      multipartUploadId,
      status: 'pending',
    };
    const result = await this.repository.registerFile(
      dataset,
      upload,
      component ? this.basename(request.originalName) : undefined,
      sessionTtlSeconds,
    );
    if (typeof result === 'string') {
      await this.storage.cleanupUpload(objectKey, multipartUploadId);
      if (result === 'missing') {
        throw this.notFound();
      }

      if (result === 'duplicate_component') {
        throw this.conflict(
          'The dataset already includes that Shapefile component.',
        );
      }

      if (result === 'invalid_basename') {
        throw this.validationError();
      }

      throw this.conflict(
        'The dataset cannot accept files in its current state.',
      );
    }

    return {
      id: result.id,
      multipart,
      uploadUrl: multipart
        ? null
        : await this.storage.presignPut(result.objectKey, result.contentType),
      partSizeBytes: multipart ? partSizeBytes : null,
    };
  }

  public async parts(
    principal: Principal,
    analysisId: string,
    datasetId: string,
    uploadId: string,
    partNumbers: number[],
  ): Promise<Array<{ partNumber: number; url: string }>> {
    const upload = await this.upload(
      principal,
      analysisId,
      datasetId,
      uploadId,
    );
    if (
      !upload.multipartUploadId ||
      upload.status !== 'pending' ||
      partNumbers.length > 20
    ) {
      throw this.validationError();
    }

    const maxParts = Math.ceil(upload.size / partSizeBytes);
    if (
      partNumbers.some(
        (partNumber) =>
          !Number.isInteger(partNumber) ||
          partNumber < 1 ||
          partNumber > maxParts,
      )
    ) {
      throw this.validationError();
    }

    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignPart(
          upload.objectKey,
          upload.multipartUploadId!,
          partNumber,
        ),
      })),
    );
  }

  public async refreshUploadUrl(
    principal: Principal,
    analysisId: string,
    datasetId: string,
    uploadId: string,
  ): Promise<string> {
    const upload = await this.upload(
      principal,
      analysisId,
      datasetId,
      uploadId,
    );
    if (upload.multipartUploadId || upload.status !== 'pending') {
      throw this.conflict(
        'The upload URL cannot be refreshed in its current state.',
      );
    }

    return this.storage.presignPut(upload.objectKey, upload.contentType);
  }

  public async completeFile(
    principal: Principal,
    analysisId: string,
    datasetId: string,
    uploadId: string,
    request: CompleteUploadRequest,
  ): Promise<void> {
    const upload = await this.upload(
      principal,
      analysisId,
      datasetId,
      uploadId,
    );
    if (upload.status === 'completed') {
      return;
    }

    if (upload.multipartUploadId) {
      await this.storage.completeMultipart(
        upload.objectKey,
        upload.multipartUploadId,
        this.partsForCompletion(request),
      );
    }

    const object = await this.storage.head(upload.objectKey);
    if (!object || object.size !== upload.size) {
      throw this.validationError('The uploaded file could not be verified.');
    }

    const result = await this.repository.completeFile(upload);
    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'invalid') {
      throw this.conflict(
        'The upload cannot be completed in its current state.',
      );
    }
  }

  public async completeDataset(
    principal: Principal,
    analysisId: string,
    datasetId: string,
  ): Promise<UploadDataset> {
    await this.analysisService.find(principal, analysisId);
    const attached = await this.repository.attached(analysisId, datasetId);
    if (attached) {
      return attached.dataset;
    }

    const dataset = await this.dataset(principal, analysisId, datasetId);
    const claimId = randomBytes(16).toString('hex');
    const result = await this.repository.claimCompletion(
      dataset,
      dataset.format === 'shapefile' ? shapefileRequiredComponents : [],
      claimId,
      new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    );
    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'incomplete') {
      throw this.validationError('All required files must be completed first.');
    }

    if (result === 'claimed') {
      throw new ApiException(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'The dataset completion is in progress. Retry the request.',
      );
    }

    if (result === 'invalid' || result === 'invalid_analysis') {
      throw this.conflict(
        'The dataset cannot be completed in its current state.',
      );
    }

    const uploads = await this.repository.uploads(result);
    try {
      const objects = await Promise.all(
        uploads.map(async (upload) => ({
          upload,
          object: await this.storage.head(upload.objectKey),
        })),
      );
      if (
        objects.some(
          ({ upload, object }) => !object || object.size !== upload.size,
        )
      ) {
        await this.abortDataset(principal, analysisId, datasetId);
        throw this.validationError('The uploaded file could not be verified.');
      }
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }

      throw new ApiException(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'Storage is temporarily unavailable. Retry the request.',
      );
    }

    const attachedDataset: AnalysisInputDataset = {
      dataset: this.repository.publicDataset({ ...result, status: 'ready' }),
      files: uploads.map((upload) => ({
        uploadId: upload.id,
        storageKey: upload.objectKey,
        originalName: upload.originalName,
        size: upload.size,
        declaredSha256: upload.sha256,
        sha256Verification: 'client-declared',
        contentType: upload.contentType ?? null,
        component: upload.component ?? null,
      })),
      attachedAt: new Date().toISOString(),
    };
    const attachedResult = await this.repository.attach(
      result,
      claimId,
      attachedDataset,
    );
    if (typeof attachedResult === 'string') {
      if (attachedResult === 'missing') {
        throw this.notFound();
      }

      throw this.conflict(
        'The dataset cannot be completed in its current state.',
      );
    }

    return attachedResult;
  }

  public async completeInputs(
    principal: Principal,
    analysisId: string,
    expectedInputRevision: number,
  ): Promise<Analysis> {
    const result = await this.repository.markReady(
      analysisId,
      principal.userId,
      expectedInputRevision,
    );
    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'incomplete') {
      throw this.validationError(
        'One occurrence dataset and at least one predictor dataset are required.',
      );
    }

    if (result === 'stale') {
      throw this.conflict(
        'The inputs changed. Reload before completing the input step.',
      );
    }

    if (result === 'invalid') {
      throw this.conflict(
        'The analysis inputs cannot be completed in its current state.',
      );
    }

    return JSON.parse(result.analysis) as Analysis;
  }

  public async inputs(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisInputManifest> {
    const analysis = await this.analysisService.find(principal, analysisId);
    const manifest = await this.repository.manifest(analysisId);
    return {
      analysisId,
      inputRevision: analysis.inputRevision,
      datasets: manifest.datasets.map((entry) => ({
        dataset: entry.dataset,
        attachedAt: entry.attachedAt,
        files: entry.files.map((file) => ({
          uploadId: file.uploadId,
          originalName: file.originalName,
          size: file.size,
          declaredSha256: file.declaredSha256,
          sha256Verification: file.sha256Verification,
          contentType: file.contentType,
          component: file.component,
        })),
      })),
    };
  }

  public async removeInput(
    principal: Principal,
    analysisId: string,
    datasetId: string,
  ): Promise<void> {
    await this.analysisService.find(principal, analysisId);
    const manifest = await this.repository.manifest(analysisId);
    if (!manifest.datasets.some((entry) => entry.dataset.id === datasetId)) {
      return;
    }
    const removed = await this.repository.detach(
      analysisId,
      datasetId,
      principal.userId,
    );
    if (removed === 'missing') {
      throw this.notFound();
    }
    if (removed === 'invalid') {
      throw this.conflict('The analysis inputs are frozen.');
    }
    await Promise.all(
      removed.files.map(async (file) =>
        this.storage.cleanupUpload(file.storageKey, undefined),
      ),
    );
  }

  public async abortDataset(
    principal: Principal,
    analysisId: string,
    datasetId: string,
  ): Promise<void> {
    await this.analysisService.find(principal, analysisId);
    const existing = await this.repository.findOwned(
      analysisId,
      datasetId,
      principal.userId,
    );
    if (!existing) {
      return;
    }
    const aborted = await this.repository.abortDataset(existing);
    if (aborted === 'missing') {
      throw this.notFound();
    }

    await this.cleanupDataset(aborted);
    await this.repository.deleteDataset(aborted);
  }

  public async expireDue(now = new Date()): Promise<void> {
    const datasets = await this.repository.due(now);
    await Promise.all(
      datasets.map(async (dataset) => {
        await this.repository.abortDataset(dataset);
        await this.cleanupDataset(dataset);
        await this.repository.deleteDataset(dataset);
      }),
    );
  }

  private async cleanupDataset(dataset: DatasetSession): Promise<void> {
    const uploads = await this.repository.uploads(dataset);
    await Promise.all(
      uploads.map(async (upload) => {
        await this.storage.cleanupUpload(
          upload.objectKey,
          upload.multipartUploadId,
        );
        await this.repository.deleteUpload(upload.id);
      }),
    );
  }

  private async dataset(
    principal: Principal,
    analysisId: string,
    datasetId: string,
  ): Promise<DatasetSession> {
    const dataset = await this.repository.findOwned(
      analysisId,
      datasetId,
      principal.userId,
    );
    if (!dataset) {
      throw this.notFound();
    }

    return dataset;
  }

  private async upload(
    principal: Principal,
    analysisId: string,
    datasetId: string,
    uploadId: string,
  ): Promise<UploadSession> {
    const upload = await this.repository.findUploadOwned(
      analysisId,
      datasetId,
      uploadId,
      principal.userId,
    );
    if (!upload) {
      throw this.notFound();
    }

    return upload;
  }

  private validateKindAndFormat(
    kind: DatasetSession['kind'],
    format: DatasetSession['format'],
  ): void {
    const valid =
      kind === 'occurrence'
        ? ['csv', 'xlsx', 'geojson', 'gpkg', 'shapefile'].includes(format)
        : ['geotiff', 'geotiff-zip'].includes(format);
    if (!valid) {
      throw this.validationError();
    }
  }

  private validateFile(
    dataset: DatasetSession,
    file: CreateUploadFileRequest,
  ): ShapefileComponent | undefined {
    const extension = this.extension(file.originalName);
    if (dataset.format === 'shapefile') {
      if (
        !file.component ||
        file.component !== extension ||
        !shapefileAllowedComponents.includes(file.component)
      ) {
        throw this.validationError();
      }

      return file.component;
    }

    const expectedExtension: Record<
      Exclude<DatasetSession['format'], 'shapefile'>,
      string[]
    > = {
      csv: ['csv'],
      xlsx: ['xlsx'],
      geojson: ['geojson', 'json'],
      gpkg: ['gpkg'],
      geotiff: ['tif', 'tiff'],
      'geotiff-zip': ['zip'],
    };
    if (
      file.component ||
      !expectedExtension[dataset.format].includes(extension) ||
      !this.validContentType(dataset.format, file.contentType)
    ) {
      throw this.validationError();
    }

    return undefined;
  }

  private partsForCompletion(request: CompleteUploadRequest): CompletedPart[] {
    if (
      request.parts.length === 0 ||
      new Set(request.parts.map((part) => part.partNumber)).size !==
        request.parts.length
    ) {
      throw this.validationError();
    }

    return request.parts.map((part) => ({
      PartNumber: part.partNumber,
      ETag: part.etag,
    }));
  }

  private validContentType(
    format: Exclude<DatasetSession['format'], 'shapefile'>,
    contentType: string | undefined,
  ): boolean {
    if (!contentType) {
      return true;
    }
    const value = contentType.toLowerCase().split(';', 1)[0]?.trim();
    const allowed: Record<typeof format, string[]> = {
      csv: ['text/csv', 'application/csv', 'text/plain'],
      xlsx: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream',
      ],
      geojson: ['application/geo+json', 'application/json', 'text/json'],
      gpkg: [
        'application/geopackage+sqlite3',
        'application/x-sqlite3',
        'application/octet-stream',
      ],
      geotiff: [
        'image/tiff',
        'application/geotiff',
        'application/x-geotiff',
        'application/octet-stream',
      ],
      'geotiff-zip': [
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
      ],
    };
    return Boolean(value && allowed[format].includes(value));
  }

  private objectKey(
    dataset: DatasetSession,
    uploadId: string,
    component: ShapefileComponent | undefined,
  ): string {
    return `analyses/${dataset.analysisId}/inputs/${dataset.id}/${component ?? uploadId}`;
  }

  private sizeLimit(kind: DatasetSession['kind']): number {
    return kind === 'predictor' ? predictorLimitBytes : occurrenceLimitBytes;
  }

  private extension(name: string): string {
    const safeName = this.safeName(name);
    return safeName.slice(safeName.lastIndexOf('.') + 1).toLowerCase();
  }

  private basename(name: string): string {
    const safeName = this.safeName(name);
    return safeName.slice(0, safeName.lastIndexOf('.')).toLocaleLowerCase();
  }

  private safeName(name: string): string {
    return name
      .normalize('NFKC')
      .replace(/[\\/\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 255);
  }

  private fingerprint(request: CreateUploadDatasetRequest): string {
    return createHash('sha256').update(JSON.stringify(request)).digest('hex');
  }

  private id(prefix: string): string {
    return `${prefix}_${randomBytes(16).toString('hex')}`;
  }

  private validationError(message = 'The request is invalid.'): ApiException {
    return new ApiException(400, 'VALIDATION_FAILED', message);
  }

  private conflict(message: string): ApiException {
    return new ApiException(409, 'CONFLICT', message);
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
