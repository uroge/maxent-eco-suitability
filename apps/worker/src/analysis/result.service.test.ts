import { createHash } from 'node:crypto';
import { scientificArtifactSpecifications } from '@ecosuitability/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ResultService, type ProvisionalResult } from './result.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';
const job = { id: analysisId, data: { analysisId, ownerId: 'user_123' } };

const provisional = (
  publicationState: ProvisionalResult['publicationState'] = 'uploading',
): ProvisionalResult => ({
  analysisId,
  jobId: analysisId,
  attempt: 1,
  candidateCompletedAt:
    publicationState === 'provisioned' ? null : '2026-09-02T12:00:00.000Z',
  publicationState,
  artifacts: scientificArtifactSpecifications.map((definition, index) => {
    const id = `ar_${String(index).padStart(32, '0')}`;
    return {
      id,
      kind: definition.kind,
      filename: definition.filename,
      storageKey: `analyses/${analysisId}/results/${id}/${definition.filename}`,
      contentType: definition.contentType,
      contentDisposition: `attachment; filename="${definition.filename}"`,
      size: index + 1,
      sha256: createHash('sha256').update(definition.kind).digest('hex'),
      sha256Verification: 'worker-verified' as const,
      createdAt:
        publicationState === 'provisioned' ? '' : '2026-09-02T12:00:00.000Z',
    };
  }),
});

const generated = (value: ProvisionalResult) =>
  value.artifacts.map((artifact) => ({
    kind: artifact.kind,
    size: artifact.size,
    sha256: artifact.sha256,
  })) as Parameters<ResultService['beginUpload']>[3];

const generatedMapAsset = {
  datasetId: 'ds_0123456789abcdef0123456789abcdef',
  filename: 'ds_0123456789abcdef0123456789abcdef.tif',
  size: 2048,
  sha256: 'a'.repeat(64),
  raster: {
    cog: true as const,
    overviewCount: 1,
    compression: 'DEFLATE',
    nodata: -3.4e38,
    crs: 'EPSG:4326',
    bounds: [-1, -1, 1, 1] as [number, number, number, number],
    resolution: [0.1, 0.1] as [number, number],
    width: 20,
    height: 20,
    dataType: 'FLT4S',
    finiteValueCount: 400,
    minimum: 0,
    maximum: 1000,
  },
  dem: {
    eligible: true,
    reason: null,
    sourceDataType: 'FLT4S',
    dataTypeValid: true,
    unit: 'metre' as const,
    crsTransformable: true,
    resolutionValid: true,
    finiteValuesValid: true,
    rangeValid: true,
  },
};

const matchingHead = (value: ProvisionalResult) =>
  vi.fn(async (key: string) => {
    const artifact = value.artifacts.find((entry) => entry.storageKey === key)!;
    return {
      size: artifact.size,
      contentType: artifact.contentType,
      contentDisposition: artifact.contentDisposition,
      sha256: artifact.sha256,
    };
  });

describe('ResultService', () => {
  it('atomically records generated metadata before issuing deterministic PUT capabilities', async () => {
    const initial = provisional('provisioned');
    const prepared = provisional();
    const lifecycle = { completeResult: vi.fn().mockResolvedValue(prepared) };
    const storage = {
      presignPut: vi.fn(async () => 'https://storage.example/upload'),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    const result = await service.beginUpload(
      job,
      1,
      initial,
      generated(prepared),
      prepared.candidateCompletedAt!,
    );
    await expect(service.uploadCapabilities(result, 900)).resolves.toHaveLength(
      9,
    );

    expect(lifecycle.completeResult).toHaveBeenCalledWith(
      analysisId,
      analysisId,
      1,
      prepared.candidateCompletedAt,
      generated(prepared),
    );
    expect(storage.presignPut).toHaveBeenCalledTimes(9);
  });

  it('verifies every uploaded object, records verified state, and publishes a key-free manifest', async () => {
    const value = provisional();
    const verified = { ...value, publicationState: 'verified' as const };
    const lifecycle = {
      verifyResult: vi.fn().mockResolvedValue(verified),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const storage = { head: matchingHead(value) };
    const service = new ResultService(lifecycle as never, storage as never);

    await expect(service.verifyAndPublish(job, 1, value)).resolves.toBe(
      'succeeded',
    );
    const manifest = lifecycle.publishResult.mock.calls[0]?.[3];
    expect(JSON.stringify(manifest)).not.toContain('storageKey');
    expect(manifest.artifacts).toHaveLength(9);
  });

  it('lets the R recovery protocol finish map assets and the bundle before publication', async () => {
    const value = provisional();
    const verified = { ...value, publicationState: 'verified' as const };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(value),
      verifyResult: vi.fn().mockResolvedValue(verified),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const service = new ResultService(
      lifecycle as never,
      { head: matchingHead(value) } as never,
    );

    await expect(service.resumeAvailable(job, 2)).resolves.toBe('not-ready');
    expect(lifecycle.publishResult).not.toHaveBeenCalled();
  });

  it('does not mark a partial upload as recoverable', async () => {
    const value = provisional();
    const lifecycle = { provisionResult: vi.fn().mockResolvedValue(value) };
    const service = new ResultService(
      lifecycle as never,
      { head: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(service.resumeAvailable(job, 2)).resolves.toBe('not-ready');
  });

  it('publishes terrain only after the R receipt and uploaded COG both verify', async () => {
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue({
        configuration: {
          predictors: [
            {
              datasetId: generatedMapAsset.datasetId,
              variableName: 'Elevation',
              type: 'continuous',
            },
          ],
          visualization: {
            terrain: { datasetId: generatedMapAsset.datasetId },
          },
        },
      }),
      publishMapAssets: vi.fn().mockResolvedValue('updated'),
    };
    const storage = {
      presignPut: vi.fn().mockResolvedValue('https://storage.example/map'),
      head: vi.fn().mockResolvedValue({
        size: generatedMapAsset.size,
        contentType: 'image/tiff',
        contentDisposition: `inline; filename="${generatedMapAsset.filename}"`,
        sha256: generatedMapAsset.sha256,
      }),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    await expect(
      service.mapAssetUploadCapabilities(analysisId, [generatedMapAsset], 900),
    ).resolves.toHaveLength(1);
    await expect(
      service.publishMapAssets(job, 1, [generatedMapAsset]),
    ).resolves.toBeUndefined();

    expect(lifecycle.publishMapAssets.mock.calls[0]?.[3]).toEqual([
      expect.objectContaining({
        datasetId: generatedMapAsset.datasetId,
        terrainEligible: true,
        terrainUnavailableReason: null,
        raster: generatedMapAsset.raster,
      }),
    ]);
  });

  it('rejects a predictor asset whose stored metadata does not match the R receipt', async () => {
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue({
        configuration: {
          predictors: [
            {
              datasetId: generatedMapAsset.datasetId,
              variableName: 'Elevation',
              type: 'continuous',
            },
          ],
          visualization: {
            terrain: { datasetId: generatedMapAsset.datasetId },
          },
        },
      }),
    };
    const service = new ResultService(
      lifecycle as never,
      { head: vi.fn().mockResolvedValue({ size: 1 }) } as never,
    );

    await expect(
      service.publishMapAssets(job, 1, [generatedMapAsset]),
    ).rejects.toThrow('storage verification failed');
  });
});
