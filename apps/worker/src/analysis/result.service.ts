import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  analysisArtifactSpecifications,
  type AnalysisArtifact,
  type AnalysisJobPayload,
  type AnalysisResultManifest,
  type RGeneratedArtifact,
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
    return this.lifecycle.publishResult(
      job.data.analysisId,
      job.id,
      attempt,
      this.manifest(job.data.analysisId, verified),
      verified.artifacts,
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
    const provisional = await this.provision(job, attempt);
    if (typeof provisional === 'string') {
      return provisional;
    }
    if (
      provisional.publicationState === 'provisioned' ||
      !provisional.candidateCompletedAt
    ) {
      return 'not-ready';
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
    const expected = new Set(
      provisional.artifacts.map((artifact) => artifact.kind),
    );
    const received = new Set(generated.map((artifact) => artifact.kind));
    if (
      generated.length !== analysisArtifactSpecifications.length ||
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

  private manifest(
    analysisId: string,
    provisional: ProvisionalResult,
  ): AnalysisResultManifest {
    if (!provisional.candidateCompletedAt) {
      throw new Error('Result publication requires a completion timestamp.');
    }
    return {
      analysisId,
      completedAt: provisional.candidateCompletedAt,
      resultExpiresAt: new Date(
        new Date(provisional.candidateCompletedAt).getTime() +
          resultRetentionMs,
      ).toISOString(),
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
    };
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
      artifacts: analysisArtifactSpecifications.map((definition) =>
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
}
