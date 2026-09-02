import { Injectable } from '@nestjs/common';
import type {
  AnalysisProgress,
  AnalysisWorkerClaimOutcome,
} from '@ecosuitability/contracts';
import { RedisService } from '../platform/redis.service';
import {
  ClaimWorkerScript,
  FinishWorkerScript,
  ScheduleCleanupScript,
  UpdateWorkerScript,
} from './worker-scripts';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const inputsKeyPrefix = 'ecosuitability:analysis-inputs:';

const cleanupKeyPrefix = 'ecosuitability:analysis-cleanup:';

const cleanupIndexKey = 'ecosuitability:analysis-cleanup:due';

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
      ],
      arguments: [`cl_${analysisId}`, now.toISOString(), String(now.getTime())],
    });
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
}
