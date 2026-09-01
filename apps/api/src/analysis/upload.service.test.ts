import type { Principal } from '@ecosuitability/contracts';
import { describe, expect, it, vi } from 'vitest';
import { UploadService } from './upload.service';

const principal: Principal = {
  userId: 'user_123',
  sessionId: 'sess_123',
  role: 'user',
};

const dataset = {
  id: 'ds_0123456789abcdef0123456789abcdef',
  analysisId: 'an_0123456789abcdef0123456789abcdef',
  ownerId: principal.userId,
  idempotencyKey: 'dataset-key-123',
  fingerprint: 'fingerprint',
  kind: 'occurrence' as const,
  format: 'shapefile' as const,
  status: 'collecting' as const,
  shapefileBasename: undefined,
  uploadIds: [],
  createdAt: '2026-08-31T12:00:00.000Z',
  expiresAt: '2026-08-31T13:00:00.000Z',
};

const createService = () => {
  const analysis = { find: vi.fn(async () => ({ status: 'draft' })) };
  const repository = {
    create: vi.fn(async (value) => ({ dataset: value, replayed: false })),
    publicDataset: vi.fn((value) => value),
    findOwned: vi.fn(async () => dataset),
    uploads: vi.fn(async () => []),
    registerFile: vi.fn(async (_dataset, upload) => upload),
    findUploadOwned: vi.fn(),
    completeFile: vi.fn(),
    completeDataset: vi.fn(),
    abortDataset: vi.fn(),
    deleteDataset: vi.fn(),
    deleteUpload: vi.fn(),
    due: vi.fn(),
  };
  const storage = {
    createMultipart: vi.fn(),
    presignPut: vi.fn(async () => 'https://storage.test/upload'),
    cleanupUpload: vi.fn(),
    completeMultipart: vi.fn(),
    head: vi.fn(),
  };

  return {
    repository,
    storage,
    service: new UploadService(
      analysis as never,
      repository as never,
      storage as never,
    ),
  };
};

describe('UploadService', () => {
  it('creates a dataset with scoped idempotency', async () => {
    const { repository, service } = createService();

    await expect(
      service.createDataset(principal, dataset.analysisId, 'dataset-key-123', {
        kind: 'occurrence',
        format: 'csv',
      }),
    ).resolves.toMatchObject({
      dataset: { status: 'collecting' },
      replayed: false,
    });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('rejects invalid dataset kind and format combinations', async () => {
    const { service } = createService();

    await expect(
      service.createDataset(principal, dataset.analysisId, 'dataset-key-123', {
        kind: 'predictor',
        format: 'csv',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('requires a declared Shapefile component matching the file extension', async () => {
    const { service } = createService();

    await expect(
      service.addFile(principal, dataset.analysisId, dataset.id, {
        originalName: 'occurrences.zip',
        size: 1024,
        sha256: 'a'.repeat(64),
        component: 'shp',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('creates a direct single-file upload for a valid Shapefile component', async () => {
    const { service } = createService();

    await expect(
      service.addFile(principal, dataset.analysisId, dataset.id, {
        originalName: 'occurrences.shp',
        size: 1024,
        sha256: 'a'.repeat(64),
        component: 'shp',
      }),
    ).resolves.toMatchObject({
      multipart: false,
      uploadUrl: 'https://storage.test/upload',
    });
  });

  it('rejects an atomically detected mismatched Shapefile basename', async () => {
    const { repository, service } = createService();
    repository.registerFile.mockResolvedValue('invalid_basename');

    await expect(
      service.addFile(principal, dataset.analysisId, dataset.id, {
        originalName: 'different.shp',
        size: 1024,
        sha256: 'a'.repeat(64),
        component: 'shp',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('masks another owner dataset as not found', async () => {
    const { repository, service } = createService();
    repository.findOwned.mockResolvedValueOnce(undefined as never);

    await expect(
      service.addFile(principal, dataset.analysisId, dataset.id, {
        originalName: 'occurrences.shp',
        size: 1024,
        sha256: 'a'.repeat(64),
        component: 'shp',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('requires all Shapefile components before completing a dataset', async () => {
    const { repository, service } = createService();
    repository.completeDataset.mockResolvedValue('incomplete');

    await expect(
      service.completeDataset(principal, dataset.analysisId, dataset.id),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('cleans storage and Redis sessions after aborting a dataset', async () => {
    const { repository, storage, service } = createService();
    const upload = {
      id: 'up_0123456789abcdef0123456789abcdef',
      datasetId: dataset.id,
      analysisId: dataset.analysisId,
      ownerId: principal.userId,
      objectKey: 'analyses/example',
      originalName: 'occurrences.shp',
      size: 1024,
      sha256: 'a'.repeat(64),
      contentType: undefined,
      format: 'shapefile' as const,
      kind: 'occurrence' as const,
      component: 'shp' as const,
      multipartUploadId: undefined,
      status: 'pending' as const,
    };
    repository.abortDataset.mockResolvedValue(dataset);
    repository.uploads.mockResolvedValue([upload] as never);

    await service.abortDataset(principal, dataset.analysisId, dataset.id);

    expect(storage.cleanupUpload).toHaveBeenCalledWith(
      upload.objectKey,
      undefined,
    );
    expect(repository.deleteUpload).toHaveBeenCalledWith(upload.id);
    expect(repository.deleteDataset).toHaveBeenCalledWith(dataset);
  });
});
