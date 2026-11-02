import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import archiver from 'archiver';
import {
  analysisArtifactSpecifications,
  analysisBundleManifestSchema,
  analysisReproducibilitySchema,
  analysisResultManifestSchema,
  scientificArtifactSpecifications,
  type AnalysisArtifact,
  type AnalysisJobPayload,
  type AnalysisReproducibility,
  type AnalysisResultManifest,
  type RGeneratedArtifact,
  type RGeneratedMapAsset,
} from '@ecosuitability/contracts';
import { WorkerStorageService } from '../storage/worker-storage.service';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';

const resultRetentionMs = 48 * 60 * 60 * 1000;

export type ProvisionalArtifact = AnalysisArtifact & {
  storageKey: string;
  contentDisposition: string;
};

export type ProvisionalResult = {
  analysisId: string;
  jobId: string;
  attempt: number;
  artifacts: ProvisionalArtifact[];
  candidateCompletedAt: string | null;
  publicationState: 'provisioned' | 'uploading' | 'verified';
};

export type ResultUploadCapability = {
  id: string;
  kind: AnalysisArtifact['kind'];
  filename: string;
  storageKey: string;
  contentType: string;
  contentDisposition: string;
  sha256: string;
  size: number;
  url: string;
};

export class ResultLifecycleError extends Error {}

@Injectable()
export class ResultService {
  public constructor(
    private readonly lifecycle: WorkerLifecycleRepository,
    private readonly storage: WorkerStorageService,
  ) {}

  public async provision(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
  ): Promise<
    | ProvisionalResult
    | 'cancelled'
    | 'dependency_unavailable'
    | 'stale_attempt'
    | 'terminal'
  > {
    if (!job.id) {
      return 'stale_attempt';
    }
    return this.lifecycle.provisionResult(
      job.data.analysisId,
      job.id,
      attempt,
      this.provisional(job.data.analysisId, job.id, attempt),
    );
  }

  public async beginUpload(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
    provisional: ProvisionalResult,
    generated: RGeneratedArtifact[],
    candidateCompletedAt: string,
  ): Promise<ProvisionalResult> {
    if (!job.id) {
      throw new ResultLifecycleError('stale_attempt');
    }
    this.assertGeneratedArtifacts(provisional, generated);
    const prepared = await this.lifecycle.completeResult(
      job.data.analysisId,
      job.id,
      attempt,
      candidateCompletedAt,
      generated,
    );
    if (typeof prepared === 'string') {
      throw new ResultLifecycleError(prepared);
    }
    return prepared;
  }

  public async uploadCapabilities(
    provisional: ProvisionalResult,
    expiresIn: number,
  ): Promise<ResultUploadCapability[]> {
    return Promise.all(
      provisional.artifacts.map(async (artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        filename: artifact.filename,
        storageKey: artifact.storageKey,
        contentType: artifact.contentType,
        contentDisposition: artifact.contentDisposition,
        sha256: artifact.sha256,
        size: artifact.size,
        url: await this.storage.presignPut(
          artifact.storageKey,
          expiresIn,
          artifact.contentType,
          artifact.contentDisposition,
          artifact.sha256,
        ),
      })),
    );
  }

  public async verifyAndPublish(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
    provisional: ProvisionalResult,
  ): Promise<'succeeded' | 'cancelled' | 'stale_attempt'> {
    if (!job.id || !provisional.candidateCompletedAt) {
      return 'stale_attempt';
    }
    this.assertCompletePublication(provisional);
    if (!(await this.artifactsExist(provisional))) {
      throw new Error('Result artifact storage verification failed.');
    }
    const verified = await this.lifecycle.verifyResult(
      job.data.analysisId,
      job.id,
      attempt,
    );
    if (typeof verified === 'string') {
      return verified === 'cancelled' ? 'cancelled' : 'stale_attempt';
    }
    this.assertCompletePublication(verified);
    const manifest = await this.manifest(job.data.analysisId, verified);
    return this.lifecycle.publishResult(
      job.data.analysisId,
      job.id,
      attempt,
      manifest,
      verified.artifacts,
    );
  }

  public async createBundle(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
    provisional: ProvisionalResult,
  ): Promise<ProvisionalResult> {
    if (!job.id || !provisional.candidateCompletedAt) {
      throw new ResultLifecycleError('stale_attempt');
    }
    const existing = provisional.artifacts.find(
      (artifact) => artifact.kind === 'result-bundle',
    );
    if (existing) {
      return provisional;
    }
    this.assertScientificArtifacts(provisional.artifacts);
    const definition = analysisArtifactSpecifications.find(
      (artifact) => artifact.kind === 'result-bundle',
    );
    if (!definition) {
      throw new Error('Result bundle definition is missing.');
    }
    const artifact = this.artifact(job.data.analysisId, definition);
    const reproducibility = await this.reproducibility(job.data.analysisId);
    const bundleManifest = analysisBundleManifestSchema.parse({
      schemaVersion: 1,
      analysisId: job.data.analysisId,
      completedAt: provisional.candidateCompletedAt,
      reproducibility,
      artifacts: provisional.artifacts.map((item) => ({
        id: item.id,
        kind: item.kind,
        filename: item.filename,
        contentType: item.contentType,
        size: item.size,
        sha256: item.sha256,
        sha256Verification: item.sha256Verification,
        createdAt: item.createdAt,
      })),
    });
    const directory = await mkdtemp(join(tmpdir(), 'ecosuitability-bundle-'));
    const archivePath = join(directory, definition.filename);
    try {
      const stagedArtifacts: Array<{
        source: ProvisionalArtifact;
        stagedPath: string;
      }> = [];
      for (const [index, source] of provisional.artifacts.entries()) {
        const stagedPath = join(directory, `artifact-${index}`);
        await this.stageVerifiedArtifact(source, stagedPath);
        stagedArtifacts.push({ source, stagedPath });
      }
      const archive = archiver('zip', { zlib: { level: 6 } });
      const output = createWriteStream(archivePath, { mode: 0o600 });
      const completion = pipeline(archive, output);
      const archivedEntries: string[] = [];
      const entryDate = new Date(provisional.candidateCompletedAt);
      archive.on('entry', (entry) => archivedEntries.push(entry.name));
      archive.on('warning', (error) => archive.destroy(error));
      for (const { source, stagedPath } of stagedArtifacts) {
        archive.file(stagedPath, {
          name: source.filename,
          date: entryDate,
          mode: 0o644,
        });
      }
      archive.append(`${JSON.stringify(bundleManifest, null, 2)}\n`, {
        name: 'bundle-manifest.json',
        date: entryDate,
        mode: 0o644,
        store: true,
      });
      await archive.finalize();
      await completion;
      const expectedEntries = [
        ...provisional.artifacts.map((item) => item.filename),
        'bundle-manifest.json',
      ];
      if (
        archivedEntries.length !== expectedEntries.length ||
        new Set(archivedEntries).size !== expectedEntries.length ||
        expectedEntries.some((entry) => !archivedEntries.includes(entry)) ||
        archivedEntries.includes(definition.filename)
      ) {
        throw new Error('Result bundle contains an invalid artifact set.');
      }
      const metadata = await stat(archivePath);
      if (!metadata.isFile() || metadata.size < 1) {
        throw new Error('Result bundle was not created.');
      }
      const sha256 = await this.hashFile(archivePath);
      const completedArtifact: ProvisionalArtifact = {
        ...artifact,
        size: metadata.size,
        sha256,
        createdAt: provisional.candidateCompletedAt,
      };
      await this.storage.putStream(
        completedArtifact.storageKey,
        createReadStream(archivePath),
        completedArtifact.contentType,
        completedArtifact.contentDisposition,
        completedArtifact.sha256,
      );
      try {
        const updated = await this.lifecycle.appendBundle(
          job.data.analysisId,
          job.id,
          attempt,
          completedArtifact,
        );
        if (typeof updated === 'string') {
          throw new ResultLifecycleError(updated);
        }
        return updated;
      } catch (error) {
        await this.storage
          .delete(completedArtifact.storageKey)
          .catch(() => undefined);
        throw error;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  public async publishMapAssets(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
    generated: RGeneratedMapAsset[],
  ): Promise<void> {
    if (!job.id) {
      throw new ResultLifecycleError('stale_attempt');
    }
    const snapshot = (await this.lifecycle.executionSnapshot(
      job.data.analysisId,
    )) as
      | {
          configuration?: {
            predictors?: Array<{
              datasetId: string;
              variableName: string;
              type: string;
            }>;
            visualization?: { terrain?: { datasetId: string } | null };
          };
        }
      | undefined;
    const assets: Array<{
      id: string;
      datasetId: string;
      label: string;
      storageKey: string;
      terrainEligible: boolean;
      terrainUnavailableReason: string | null;
      raster: RGeneratedMapAsset['raster'];
    }> = [];
    const predictors = snapshot?.configuration?.predictors ?? [];
    if (
      generated.length !== predictors.length ||
      new Set(generated.map((asset) => asset.datasetId)).size !==
        generated.length ||
      predictors.some(
        (predictor) =>
          !generated.some((asset) => asset.datasetId === predictor.datasetId),
      )
    ) {
      throw new Error('R runtime produced an invalid predictor map asset set.');
    }
    for (const predictor of predictors) {
      const generatedAsset = generated.find(
        (asset) => asset.datasetId === predictor.datasetId,
      );
      if (!generatedAsset) {
        throw new Error('R runtime omitted a predictor map asset.');
      }
      const { id, storageKey, contentDisposition } = this.mapAssetTarget(
        job.data.analysisId,
        generatedAsset,
      );
      const head = await this.storage.head(storageKey);
      if (
        !head ||
        head.size !== generatedAsset.size ||
        head.contentType !== 'image/tiff' ||
        head.contentDisposition !== contentDisposition ||
        head.sha256?.toLowerCase() !== generatedAsset.sha256.toLowerCase()
      ) {
        throw new Error('Predictor map asset storage verification failed.');
      }
      const selectedForTerrain =
        predictor.type === 'continuous' &&
        snapshot?.configuration?.visualization?.terrain?.datasetId ===
          predictor.datasetId;
      assets.push({
        id,
        datasetId: predictor.datasetId,
        label: predictor.variableName,
        storageKey,
        terrainEligible:
          selectedForTerrain && generatedAsset.dem?.eligible === true,
        terrainUnavailableReason: selectedForTerrain
          ? generatedAsset.dem?.eligible
            ? null
            : (generatedAsset.dem?.reason ??
              'The selected raster did not pass DEM validation.')
          : null,
        raster: generatedAsset.raster,
      });
    }
    const outcome = await this.lifecycle.publishMapAssets(
      job.data.analysisId,
      job.id,
      attempt,
      assets,
    );
    if (outcome !== 'updated') {
      throw new ResultLifecycleError(outcome);
    }
  }

  public async mapAssetUploadCapabilities(
    analysisId: string,
    generated: RGeneratedMapAsset[],
    expiresIn: number,
  ): Promise<unknown[]> {
    return Promise.all(
      generated.map(async (asset) => {
        const target = this.mapAssetTarget(analysisId, asset);
        return {
          kind: 'map-asset',
          datasetId: asset.datasetId,
          filename: asset.filename,
          size: asset.size,
          sha256: asset.sha256,
          contentType: 'image/tiff',
          contentDisposition: target.contentDisposition,
          url: await this.storage.presignPut(
            target.storageKey,
            expiresIn,
            'image/tiff',
            target.contentDisposition,
            asset.sha256,
          ),
        };
      }),
    );
  }

  public async resumeAvailable(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
  ): Promise<
    | 'not-ready'
    | 'succeeded'
    | 'cancelled'
    | 'dependency_unavailable'
    | 'stale_attempt'
    | 'terminal'
  > {
    let provisional = await this.provision(job, attempt);
    if (typeof provisional === 'string') {
      return provisional;
    }
    if (
      provisional.publicationState === 'provisioned' ||
      !provisional.candidateCompletedAt
    ) {
      return 'not-ready';
    }
    const hasBundle = provisional.artifacts.some(
      (artifact) => artifact.kind === 'result-bundle',
    );
    if (!hasBundle) {
      if (
        !(await this.lifecycle.mapAssetsReady(job.data.analysisId)) ||
        !(await this.artifactsExist(provisional))
      ) {
        return 'not-ready';
      }
      provisional = await this.createBundle(job, attempt, provisional);
    }
    if (!(await this.artifactsExist(provisional))) {
      return 'not-ready';
    }
    return this.verifyAndPublish(job, attempt, provisional);
  }

  private async artifactsExist(
    provisional: ProvisionalResult,
  ): Promise<boolean> {
    for (const artifact of provisional.artifacts) {
      const head = await this.storage.head(artifact.storageKey);
      if (
        !head ||
        head.size !== artifact.size ||
        head.contentType !== artifact.contentType ||
        head.contentDisposition !== artifact.contentDisposition ||
        head.sha256 !== artifact.sha256
      ) {
        return false;
      }
    }
    return true;
  }

  private assertGeneratedArtifacts(
    provisional: ProvisionalResult,
    generated: RGeneratedArtifact[],
  ): void {
    const expected = new Set<string>(
      provisional.artifacts.map((artifact) => artifact.kind),
    );
    const received = new Set<string>(
      generated.map((artifact) => artifact.kind),
    );
    if (
      generated.length !== scientificArtifactSpecifications.length ||
      expected.size !== received.size ||
      [...expected].some((kind) => !received.has(kind)) ||
      generated.some(
        (artifact) =>
          !Number.isSafeInteger(artifact.size) ||
          artifact.size < 1 ||
          !/^[a-f0-9]{64}$/i.test(artifact.sha256),
      )
    ) {
      throw new Error('R runtime produced invalid result artifact metadata.');
    }
  }

  private assertScientificArtifacts(artifacts: ProvisionalArtifact[]): void {
    const kinds = new Set(artifacts.map((artifact) => artifact.kind));
    if (
      artifacts.length !== scientificArtifactSpecifications.length ||
      kinds.size !== scientificArtifactSpecifications.length ||
      scientificArtifactSpecifications.some(
        (definition) => !kinds.has(definition.kind),
      )
    ) {
      throw new Error(
        'Result bundle requires the complete scientific artifact set.',
      );
    }
  }

  private assertCompletePublication(provisional: ProvisionalResult): void {
    const kinds = new Set(
      provisional.artifacts.map((artifact) => artifact.kind),
    );
    if (
      provisional.artifacts.length !== analysisArtifactSpecifications.length ||
      kinds.size !== analysisArtifactSpecifications.length ||
      analysisArtifactSpecifications.some(
        (definition) => !kinds.has(definition.kind),
      )
    ) {
      throw new Error('Result publication requires all ten artifacts.');
    }
  }

  private async manifest(
    analysisId: string,
    provisional: ProvisionalResult,
  ): Promise<AnalysisResultManifest> {
    if (!provisional.candidateCompletedAt) {
      throw new Error('Result publication requires a completion timestamp.');
    }
    return analysisResultManifestSchema.parse({
      analysisId,
      completedAt: provisional.candidateCompletedAt,
      resultExpiresAt: new Date(
        new Date(provisional.candidateCompletedAt).getTime() +
          resultRetentionMs,
      ).toISOString(),
      reproducibility: await this.reproducibility(analysisId),
      artifacts: provisional.artifacts.map((artifact) => ({
        id: artifact.id,
        kind: artifact.kind,
        filename: artifact.filename,
        contentType: artifact.contentType,
        size: artifact.size,
        sha256: artifact.sha256,
        sha256Verification: artifact.sha256Verification,
        createdAt: artifact.createdAt,
      })),
    });
  }

  private async reproducibility(
    analysisId: string,
  ): Promise<AnalysisReproducibility> {
    const snapshot = (await this.lifecycle.executionSnapshot(analysisId)) as
      | {
          inputRevision?: unknown;
          configurationRevision?: unknown;
          inputFingerprint?: unknown;
          fingerprint?: unknown;
          seed?: unknown;
        }
      | undefined;
    return analysisReproducibilitySchema.parse({
      inputRevision: snapshot?.inputRevision,
      configurationRevision: snapshot?.configurationRevision,
      inputFingerprint: snapshot?.inputFingerprint,
      configurationFingerprint: snapshot?.fingerprint,
      seed: snapshot?.seed,
    });
  }

  private async stageVerifiedArtifact(
    artifact: ProvisionalArtifact,
    targetPath: string,
  ): Promise<void> {
    const source = await this.storage.getStream(artifact.storageKey);
    const hash = createHash('sha256');
    let size = 0;
    const verifier = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.byteLength;
        hash.update(chunk);
        callback(null, chunk);
      },
      flush(callback) {
        if (
          size !== artifact.size ||
          hash.digest('hex').toLowerCase() !== artifact.sha256.toLowerCase()
        ) {
          callback(
            new Error(
              `Stored artifact ${artifact.filename} failed bundle verification.`,
            ),
          );
          return;
        }
        callback();
      },
    });
    await pipeline(
      source,
      verifier,
      createWriteStream(targetPath, { mode: 0o600 }),
    );
  }

  private provisional(
    analysisId: string,
    jobId: string,
    attempt: number,
  ): ProvisionalResult {
    return {
      analysisId,
      jobId,
      attempt,
      candidateCompletedAt: null,
      publicationState: 'provisioned',
      artifacts: scientificArtifactSpecifications.map((definition) =>
        this.artifact(analysisId, definition),
      ),
    };
  }

  private artifact(
    analysisId: string,
    definition: (typeof analysisArtifactSpecifications)[number],
  ): ProvisionalArtifact {
    const id = `ar_${createHash('sha256')
      .update(`${analysisId}:${definition.kind}`)
      .digest('hex')
      .slice(0, 32)}`;
    return {
      id: id as AnalysisArtifact['id'],
      kind: definition.kind,
      filename: definition.filename,
      storageKey: `analyses/${analysisId}/results/${id}/${definition.filename}`,
      contentType: definition.contentType,
      contentDisposition: `attachment; filename="${definition.filename}"`,
      size: 0,
      sha256: '0'.repeat(64),
      sha256Verification: 'worker-verified',
      createdAt: '',
    };
  }

  private mapAssetTarget(
    analysisId: string,
    asset: Pick<RGeneratedMapAsset, 'datasetId' | 'filename'>,
  ): { id: string; storageKey: string; contentDisposition: string } {
    const id = `ml_${createHash('sha256')
      .update(`${analysisId}:${asset.datasetId}`)
      .digest('hex')
      .slice(0, 32)}`;
    return {
      id,
      storageKey: `analyses/${analysisId}/map-assets/${id}.tif`,
      contentDisposition: `inline; filename="${asset.filename}"`,
    };
  }

  private async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }
}
