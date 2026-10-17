import { Injectable } from '@nestjs/common';
import type {
  AnalysisInputProfile,
  AnalysisPreflight,
  Principal,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { AnalysisQueueService } from './analysis-queue.service';
import { AnalysisRepository } from './analysis.repository';

const policyVersion = '2026-10-01';

@Injectable()
export class ValidationService {
  public constructor(
    private readonly repository: AnalysisRepository,
    private readonly queue: AnalysisQueueService,
  ) {}

  public async requestProfile(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisInputProfile> {
    const analysis = await this.owned(principal, analysisId);
    if (analysis.status !== 'ready') {
      throw this.conflict('Complete the analysis inputs before profiling.');
    }
    if (
      analysis.inputProfile?.inputRevision === analysis.inputRevision &&
      ['queued', 'running', 'passed', 'blocked'].includes(
        analysis.inputProfile.status,
      )
    ) {
      return analysis.inputProfile;
    }
    const now = new Date().toISOString();
    const profile: AnalysisInputProfile = {
      analysisId: analysis.id,
      inputRevision: analysis.inputRevision,
      policyVersion,
      status: 'queued',
      progress: 0,
      checks: [],
      warnings: [],
      blockers: [],
      occurrence: {
        columns: [],
        layers: [],
        longitudeCandidates: [],
        latitudeCandidates: [],
        speciesCandidates: [],
        recordCount: null,
        duplicateCoordinateCount: null,
      },
      rasters: [],
      spatialPreview: null,
      createdAt: now,
      completedAt: null,
    };
    const updated = await this.repository.updateValidationState(
      analysisId,
      principal.userId,
      'inputProfile',
      profile,
    );
    if (typeof updated === 'string') {
      throw this.conflict('The inputs changed while profiling was requested.');
    }
    await this.queue.enqueueInputProfile({
      analysisId: analysis.id,
      ownerId: principal.userId,
      inputRevision: analysis.inputRevision,
    });
    return profile;
  }

  public async profile(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisInputProfile> {
    const analysis = await this.owned(principal, analysisId);
    if (!analysis.inputProfile) {
      throw this.notFound();
    }
    return analysis.inputProfile;
  }

  public async requestPreflight(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisPreflight> {
    const analysis = await this.owned(principal, analysisId);
    if (
      analysis.status !== 'ready' ||
      !analysis.configuration ||
      !analysis.configurationFingerprint ||
      analysis.configurationRevision < 1
    ) {
      throw this.conflict('Save a valid configuration before preflight.');
    }
    if (
      analysis.preflight?.inputRevision === analysis.inputRevision &&
      analysis.preflight.configurationRevision ===
        analysis.configurationRevision &&
      analysis.preflight.configurationFingerprint ===
        analysis.configurationFingerprint &&
      ['queued', 'running', 'passed', 'blocked'].includes(
        analysis.preflight.status,
      )
    ) {
      return analysis.preflight;
    }
    const now = new Date().toISOString();
    const preflight: AnalysisPreflight = {
      analysisId: analysis.id,
      inputRevision: analysis.inputRevision,
      configurationRevision: analysis.configurationRevision,
      configurationFingerprint: analysis.configurationFingerprint,
      policyVersion,
      status: 'queued',
      progress: 0,
      checks: [],
      warnings: [],
      blockers: [],
      createdAt: now,
      completedAt: null,
    };
    const updated = await this.repository.updateValidationState(
      analysisId,
      principal.userId,
      'preflight',
      preflight,
    );
    if (typeof updated === 'string') {
      throw this.conflict(
        'The configuration changed while preflight was requested.',
      );
    }
    await this.queue.enqueuePreflight({
      analysisId: analysis.id,
      ownerId: principal.userId,
      inputRevision: analysis.inputRevision,
      configurationRevision: analysis.configurationRevision,
    });
    return preflight;
  }

  public async preflight(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisPreflight> {
    const analysis = await this.owned(principal, analysisId);
    if (!analysis.preflight) {
      throw this.notFound();
    }
    return analysis.preflight;
  }

  private async owned(principal: Principal, analysisId: string) {
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );
    if (!analysis) {
      throw this.notFound();
    }
    return analysis;
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
