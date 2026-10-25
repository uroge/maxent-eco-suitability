import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  analysisArtifactSpecifications,
  scientificArtifactSpecifications,
} from '@ecosuitability/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ResultService, type ProvisionalResult } from './result.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';
const job = { id: analysisId, data: { analysisId, ownerId: 'user_123' } };

const executionSnapshot = {
  inputRevision: 2,
  configurationRevision: 1,
  inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
  fingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
  seed: 42,
};

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

const withBundle = (value: ProvisionalResult): ProvisionalResult => {
  const definition = analysisArtifactSpecifications.find(
    (artifact) => artifact.kind === 'result-bundle',
  )!;
  return {
    ...value,
    artifacts: [
      ...value.artifacts,
      {
        id: `ar_${'f'.repeat(32)}`,
        ...definition,
        storageKey: `analyses/${analysisId}/results/bundle/${definition.filename}`,
        contentDisposition: `attachment; filename="${definition.filename}"`,
        size: 4096,
        sha256: 'f'.repeat(64),
        sha256Verification: 'worker-verified',
        createdAt: value.candidateCompletedAt!,
      },
    ],
  };
};

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
    const value = withBundle(provisional());
    const verified = { ...value, publicationState: 'verified' as const };
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue(executionSnapshot),
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
    expect(manifest.artifacts).toHaveLength(10);
    expect(manifest.reproducibility).toEqual({
      inputRevision: 2,
      configurationRevision: 1,
      inputFingerprint: executionSnapshot.inputFingerprint,
      configurationFingerprint: executionSnapshot.fingerprint,
      seed: 42,
    });
  });

  it('lets the R recovery protocol finish map assets and the bundle before publication', async () => {
    const value = provisional();
    const verified = { ...value, publicationState: 'verified' as const };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(value),
      mapAssetsReady: vi.fn().mockResolvedValue(false),
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
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(value),
      mapAssetsReady: vi.fn().mockResolvedValue(true),
    };
    const service = new ResultService(
      lifecycle as never,
      { head: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(service.resumeAvailable(job, 2)).resolves.toBe('not-ready');
  });

  it('builds a verified non-recursive ZIP with frozen reproducibility metadata', async () => {
    const initial = provisional();
    const contents = new Map(
      initial.artifacts.map((artifact) => {
        const body = Buffer.from(`contents:${artifact.kind}`);
        artifact.size = body.byteLength;
        artifact.sha256 = createHash('sha256').update(body).digest('hex');
        return [artifact.storageKey, body];
      }),
    );
    let uploaded = Buffer.alloc(0);
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue(executionSnapshot),
      appendBundle: vi.fn(async (_analysisId, _jobId, _attempt, artifact) => ({
        ...initial,
        artifacts: [...initial.artifacts, artifact],
      })),
    };
    const storage = {
      getStream: vi.fn(async (key: string) =>
        Readable.from(contents.get(key)!),
      ),
      putStream: vi.fn(async (_key, body: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) {
          chunks.push(Buffer.from(chunk));
        }
        uploaded = Buffer.concat(chunks);
      }),
      delete: vi.fn(),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    const bundled = await service.createBundle(job, 1, initial);

    expect(bundled.artifacts).toHaveLength(10);
    expect(uploaded.subarray(0, 2).toString()).toBe('PK');
    for (const artifact of initial.artifacts) {
      expect(uploaded.includes(Buffer.from(artifact.filename))).toBe(true);
    }
    expect(uploaded.includes(Buffer.from('bundle-manifest.json'))).toBe(true);
    expect(uploaded.includes(Buffer.from('ecosuitability-results.zip'))).toBe(
      false,
    );
    expect(
      uploaded.includes(Buffer.from(executionSnapshot.inputFingerprint)),
    ).toBe(true);
    expect(lifecycle.appendBundle).toHaveBeenCalledOnce();
  });

  it('rejects changed scientific bytes instead of packaging them', async () => {
    const initial = provisional();
    const storage = {
      getStream: vi.fn(async () => Readable.from(Buffer.from('changed'))),
      putStream: vi.fn(),
      delete: vi.fn(),
    };
    const service = new ResultService(
      {
        executionSnapshot: vi.fn().mockResolvedValue(executionSnapshot),
      } as never,
      storage as never,
    );

    await expect(service.createBundle(job, 1, initial)).rejects.toThrow(
      'failed bundle verification',
    );
    expect(storage.putStream).not.toHaveBeenCalled();
  });

  it('resumes bundle creation only after predictor map assets were published', async () => {
    const initial = provisional();
    const bundled = withBundle(initial);
    const verified = { ...bundled, publicationState: 'verified' as const };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(initial),
      mapAssetsReady: vi.fn().mockResolvedValue(true),
      executionSnapshot: vi.fn().mockResolvedValue(executionSnapshot),
      verifyResult: vi.fn().mockResolvedValue(verified),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const storage = {
      head: vi.fn(async (key: string) => {
        const artifact = bundled.artifacts.find(
          (candidate) => candidate.storageKey === key,
        )!;
        return {
          size: artifact.size,
          contentType: artifact.contentType,
          contentDisposition: artifact.contentDisposition,
          sha256: artifact.sha256,
        };
      }),
    };
    const service = new ResultService(lifecycle as never, storage as never);
    vi.spyOn(service, 'createBundle').mockResolvedValue(bundled);

    await expect(service.resumeAvailable(job, 2)).resolves.toBe('succeeded');
    expect(service.createBundle).toHaveBeenCalledWith(job, 2, initial);
    expect(lifecycle.publishResult).toHaveBeenCalledOnce();
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
