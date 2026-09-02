import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  AnalysisArtifact,
  AnalysisArtifactKind,
  AnalysisJobPayload,
  AnalysisResultManifest,
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

@Injectable()
export class ResultService {
  public constructor(
    private readonly lifecycle: WorkerLifecycleRepository,
    private readonly storage: WorkerStorageService,
  ) {}

  public async publish(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
  ): Promise<'succeeded' | 'cancelled' | 'stale_attempt' | 'terminal'> {
    if (!job.id) {
      return 'stale_attempt';
    }

    const provisional = await this.lifecycle.provisionResult(
      job.data.analysisId,
      job.id,
      attempt,
      this.provisional(job.data.analysisId, job.id, attempt),
    );
    if (typeof provisional === 'string') {
      return provisional;
    }

    const ready = await this.lifecycle.completeResult(
      job.data.analysisId,
      job.id,
      attempt,
    );
    if (typeof ready === 'string') {
      return ready;
    }

    if (ready.publicationState === 'verified') {
      return this.publishVerified(job, attempt, ready);
    }

    const artifacts = ready.artifacts.map((artifact) => ({
      ...artifact,
      createdAt: ready.candidateCompletedAt!,
    }));
    for (const artifact of artifacts) {
      const bytes = this.bytes(artifact.kind, ready.candidateCompletedAt!);
      const sha256 = this.sha256(bytes);
      await this.storage.put(
        artifact.storageKey,
        bytes,
        artifact.contentType,
        artifact.contentDisposition,
        sha256,
      );
      const head = await this.storage.head(artifact.storageKey);
      if (
        !head ||
        head.size !== bytes.length ||
        head.contentType !== artifact.contentType ||
        head.contentDisposition !== artifact.contentDisposition ||
        head.sha256 !== sha256
      ) {
        throw new Error('Result artifact storage verification failed.');
      }

      artifact.size = bytes.length;
      artifact.sha256 = sha256;
    }

    const manifest = this.manifest(job.data.analysisId, ready, artifacts);
    return this.lifecycle.publishResult(
      job.data.analysisId,
      job.id,
      attempt,
      manifest,
      artifacts,
    );
  }

  public async resumeVerified(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
  ): Promise<
    'not-verified' | 'succeeded' | 'cancelled' | 'stale_attempt' | 'terminal'
  > {
    if (!job.id) {
      return 'stale_attempt';
    }

    const provisional = await this.lifecycle.provisionResult(
      job.data.analysisId,
      job.id,
      attempt,
      this.provisional(job.data.analysisId, job.id, attempt),
    );
    if (typeof provisional === 'string') {
      return provisional;
    }
    if (provisional.publicationState !== 'verified') {
      return 'not-verified';
    }

    return this.publishVerified(job, attempt, provisional);
  }

  private async publishVerified(
    job: { id?: string; data: AnalysisJobPayload },
    attempt: number,
    provisional: ProvisionalResult,
  ): Promise<'succeeded' | 'cancelled' | 'stale_attempt'> {
    if (!job.id || !provisional.candidateCompletedAt) {
      return 'stale_attempt';
    }

    const artifacts = provisional.artifacts.map((artifact) => ({
      ...artifact,
    }));
    for (const artifact of artifacts) {
      const head = await this.storage.head(artifact.storageKey);
      if (
        !head ||
        head.size !== artifact.size ||
        head.contentType !== artifact.contentType ||
        head.contentDisposition !== artifact.contentDisposition ||
        head.sha256 !== artifact.sha256
      ) {
        throw new Error(
          'Verified result artifact storage verification failed.',
        );
      }
    }

    return this.lifecycle.publishResult(
      job.data.analysisId,
      job.id,
      attempt,
      this.manifest(job.data.analysisId, provisional, artifacts),
      artifacts,
    );
  }

  private manifest(
    analysisId: string,
    provisional: ProvisionalResult,
    artifacts: ProvisionalArtifact[],
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
      artifacts: artifacts.map((artifact) => ({
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
      artifacts: (['execution-summary', 'run-log'] as const).map((kind) =>
        this.artifact(analysisId, kind),
      ),
    };
  }

  private artifact(
    analysisId: string,
    kind: AnalysisArtifactKind,
  ): ProvisionalArtifact {
    const id = `ar_${createHash('sha256')
      .update(`${analysisId}:${kind}`)
      .digest('hex')
      .slice(0, 32)}`;
    const summary = kind === 'execution-summary';
    const filename = summary ? 'execution-summary.json' : 'run.log.txt';
    return {
      id: id as AnalysisArtifact['id'],
      kind,
      filename,
      storageKey: `analyses/${analysisId}/results/${id}/${filename}`,
      contentType: summary ? 'application/json' : 'text/plain; charset=utf-8',
      contentDisposition: `attachment; filename="${filename}"`,
      size: 0,
      sha256: '0'.repeat(64),
      sha256Verification: 'worker-generated',
      createdAt: '',
    };
  }

  private bytes(kind: AnalysisArtifactKind, completedAt: string): Uint8Array {
    const value =
      kind === 'execution-summary'
        ? JSON.stringify({ status: 'succeeded', completedAt })
        : `preparing\nvalidating-inputs\nexecuting\nfinalizing\ncompleted:${completedAt}\n`;
    return new TextEncoder().encode(value);
  }

  private sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
