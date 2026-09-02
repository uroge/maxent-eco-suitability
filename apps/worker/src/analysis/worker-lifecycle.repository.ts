import { Injectable } from '@nestjs/common';
import type {
  AnalysisProgress,
  AnalysisWorkerClaimOutcome,
} from '@ecosuitability/contracts';
import { RedisService } from '../platform/redis.service';
import {
  ClaimWorkerScript,
  CleanupProvisionalScript,
  CompleteResultScript,
  FinishWorkerScript,
  ProvisionResultScript,
  PublishResultScript,
  ScheduleCleanupScript,
  UpdateWorkerScript,
} from './worker-scripts';
import type { AnalysisResultManifest } from '@ecosuitability/contracts';
import type { ProvisionalArtifact, ProvisionalResult } from './result.service';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const inputsKeyPrefix = 'ecosuitability:analysis-inputs:';

const cleanupKeyPrefix = 'ecosuitability:analysis-cleanup:';

const cleanupIndexKey = 'ecosuitability:analysis-cleanup:due';

const resultKeyPrefix = 'ecosuitability:analysis-result-provisional:';

const expiryIndexKey = 'ecosuitability:analysis:expiry';

@Injectable()
export class WorkerLifecycleRepository {
  public constructor(private readonly redis: RedisService) {}

  public async claim(
    analysisId: string,
    jobId: string,
    attempt: number,
  ): Promise<AnalysisWorkerClaimOutcome> {
    return this.evalOutcome(
      ClaimWorkerScript,
      [this.analysisKey(analysisId)],
      [jobId, String(attempt), new Date().toISOString()],
    );
  }

  public async updateProgress(
    analysisId: string,
    jobId: string,
    attempt: number,
    progress: AnalysisProgress,
  ): Promise<AnalysisWorkerClaimOutcome> {
    return this.evalOutcome(
      UpdateWorkerScript,
      [this.analysisKey(analysisId)],
      [
        jobId,
        String(attempt),
        new Date().toISOString(),
        JSON.stringify(progress),
      ],
    );
  }

  public async finish(
    analysisId: string,
    jobId: string,
    attempt: number,
    status: 'queued' | 'succeeded' | 'failed',
    failure: { code: string; message: string } | null,
    progress: AnalysisProgress,
  ): Promise<AnalysisWorkerClaimOutcome> {
    return this.evalOutcome(
      FinishWorkerScript,
      [this.analysisKey(analysisId)],
      [
        jobId,
        String(attempt),
        new Date().toISOString(),
        status,
        JSON.stringify(failure),
        JSON.stringify(progress),
      ],
    );
  }

  public async finaliseCancellation(analysisId: string): Promise<void> {
    const now = new Date();
    await this.redis.getClient().eval(ScheduleCleanupScript, {
      keys: [
        this.analysisKey(analysisId),
        `${inputsKeyPrefix}${analysisId}`,
        `${cleanupKeyPrefix}cl_${analysisId}`,
        cleanupIndexKey,
        this.resultKey(analysisId),
      ],
      arguments: [`cl_${analysisId}`, now.toISOString(), String(now.getTime())],
    });
  }

  public async cleanupProvisional(analysisId: string): Promise<void> {
    const now = new Date();
    await this.redis.getClient().eval(CleanupProvisionalScript, {
      keys: [
        this.resultKey(analysisId),
        `${cleanupKeyPrefix}cl_${analysisId}`,
        cleanupIndexKey,
        `${inputsKeyPrefix}${analysisId}`,
      ],
      arguments: [`cl_${analysisId}`, now.toISOString(), String(now.getTime())],
    });
  }

  public async provisionResult(
    analysisId: string,
    jobId: string,
    attempt: number,
    provisional: ProvisionalResult,
  ): Promise<ProvisionalResult | 'cancelled' | 'terminal' | 'stale_attempt'> {
    const result = (await this.redis.getClient().eval(ProvisionResultScript, {
      keys: [this.analysisKey(analysisId), this.resultKey(analysisId)],
      arguments: [jobId, String(attempt), JSON.stringify(provisional)],
    })) as string[];
    return result[0] === 'provisioned'
      ? (JSON.parse(result[1]) as ProvisionalResult)
      : (result[0] as 'cancelled' | 'terminal' | 'stale_attempt');
  }

  public async completeResult(
    analysisId: string,
    jobId: string,
    attempt: number,
  ): Promise<ProvisionalResult | 'cancelled' | 'stale_attempt'> {
    const result = (await this.redis.getClient().eval(CompleteResultScript, {
      keys: [this.analysisKey(analysisId), this.resultKey(analysisId)],
      arguments: [jobId, String(attempt), new Date().toISOString()],
    })) as string[];
    return result[0] === 'ready'
      ? (JSON.parse(result[1]) as ProvisionalResult)
      : (result[0] as 'cancelled' | 'stale_attempt');
  }

  public async publishResult(
    analysisId: string,
    jobId: string,
    attempt: number,
    manifest: AnalysisResultManifest,
    artifacts: ProvisionalArtifact[],
  ): Promise<'succeeded' | 'cancelled' | 'stale_attempt'> {
    const provisional = await this.redis
      .getClient()
      .get(this.resultKey(analysisId));
    if (!provisional) {
      return 'stale_attempt';
    }

    const verified = {
      ...(JSON.parse(provisional) as ProvisionalResult),
      artifacts,
      publicationState: 'verified',
    };
    await this.redis
      .getClient()
      .set(this.resultKey(analysisId), JSON.stringify(verified), {
        KEEPTTL: true,
      });
    const result = (await this.redis.getClient().eval(PublishResultScript, {
      keys: [
        this.analysisKey(analysisId),
        this.resultKey(analysisId),
        expiryIndexKey,
      ],
      arguments: [
        jobId,
        String(attempt),
        manifest.resultExpiresAt,
        JSON.stringify({
          stage: 'completed',
          percent: 100,
          attempt,
          updatedAt: manifest.completedAt,
        }),
        JSON.stringify({ ...manifest, artifacts }),
        String(new Date(manifest.resultExpiresAt).getTime()),
      ],
    })) as string[];
    return result[0] as 'succeeded' | 'cancelled' | 'stale_attempt';
  }

  private async evalOutcome(
    script: string,
    keys: string[],
    arguments_: string[],
  ): Promise<AnalysisWorkerClaimOutcome> {
    const result = (await this.redis.getClient().eval(script, {
      keys,
      arguments: arguments_,
    })) as string[];
    return result[0] as AnalysisWorkerClaimOutcome;
  }

  private analysisKey(analysisId: string): string {
    return `${analysisKeyPrefix}${analysisId}`;
  }

  private resultKey(analysisId: string): string {
    return `${resultKeyPrefix}${analysisId}`;
  }
}
