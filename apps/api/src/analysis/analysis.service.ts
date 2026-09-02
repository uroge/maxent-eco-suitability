import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type {
  Analysis,
  AnalysisFailure,
  AnalysisStatus,
  CreateAnalysisRequest,
  IdempotencyKey,
  Principal,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { AnalysisRepository } from './analysis.repository';
import type { StoredAnalysis } from './analysis.types';

const retentionMs = 48 * 60 * 60 * 1000;

const retentionSeconds = retentionMs / 1000;

const transitionRules: Record<AnalysisStatus, AnalysisStatus[]> = {
  draft: ['uploading', 'cancelled'],
  uploading: ['ready', 'cancelled'],
  ready: ['queued', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

type CreateAnalysisResult = {
  analysis: Analysis;
  replayed: boolean;
};

@Injectable()
export class AnalysisService {
  public constructor(private readonly repository: AnalysisRepository) {}

  public async create(
    principal: Principal,
    idempotencyKey: IdempotencyKey,
    request: CreateAnalysisRequest,
  ): Promise<CreateAnalysisResult> {
    const now = new Date();
    const analysis: StoredAnalysis = {
      id: `an_${randomBytes(16).toString('hex')}`,
      ownerId: principal.userId,
      idempotencyKey,
      status: 'draft',
      displayName: request.displayName ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionMs).toISOString(),
      expiredAt: null,
      failure: null,
      occurrenceDatasetId: undefined,
    };
    const result = await this.repository.create(
      { analysis, fingerprint: this.fingerprint(request) },
      retentionSeconds,
    );

    if (result === 'conflict') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The idempotency key was already used for a different request.',
      );
    }

    return {
      analysis: this.publicAnalysis(result.analysis),
      replayed: result.replayed,
    };
  }

  public async find(
    principal: Principal,
    analysisId: string,
  ): Promise<Analysis> {
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );

    if (!analysis) {
      throw this.notFound();
    }

    return this.publicAnalysis(analysis);
  }

  public async cancel(
    principal: Principal,
    analysisId: string,
  ): Promise<Analysis> {
    const existing = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );

    if (!existing) {
      throw this.notFound();
    }

    if (existing.status === 'cancelled') {
      return this.publicAnalysis(existing);
    }

    const result = await this.repository.cancel(analysisId, principal.userId);

    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'invalid') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis cannot be cancelled in its current state.',
      );
    }

    return this.publicAnalysis(result);
  }

  public async transitionInternal(
    analysisId: string,
    ownerId: string,
    status: AnalysisStatus,
    failure: AnalysisFailure | null = null,
  ): Promise<Analysis> {
    const existing = await this.repository.findOwned(analysisId, ownerId);

    if (!existing) {
      throw this.notFound();
    }

    if (!transitionRules[existing.status].includes(status)) {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis cannot transition to the requested state.',
      );
    }

    if ((status === 'failed') !== Boolean(failure)) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The request is invalid.',
      );
    }

    const result = await this.repository.transition({
      analysisId,
      ownerId,
      expectedStatuses: [existing.status],
      status,
      failure,
    });

    if (result === 'missing') {
      throw this.notFound();
    }

    if (result === 'invalid') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis state changed. Retry the operation.',
      );
    }

    return this.publicAnalysis(result);
  }

  private fingerprint(request: CreateAnalysisRequest): string {
    return createHash('sha256').update(JSON.stringify(request)).digest('hex');
  }

  private publicAnalysis(analysis: StoredAnalysis): Analysis {
    return {
      id: analysis.id,
      status: analysis.status,
      displayName: analysis.displayName,
      createdAt: analysis.createdAt,
      updatedAt: analysis.updatedAt,
      expiresAt: analysis.expiresAt,
      expiredAt: analysis.expiredAt,
      failure: analysis.failure,
    };
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
