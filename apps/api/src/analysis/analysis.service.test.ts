import type {
  AnalysisFailure,
  AnalysisStatus,
  Principal,
} from '@ecosuitability/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisService } from './analysis.service';
import type { StoredAnalysis } from './analysis.types';

const principal: Principal = {
  userId: 'user_123',
  sessionId: 'sess_123',
  role: 'user',
};

const createStoredAnalysis = (
  status: AnalysisStatus = 'draft',
): StoredAnalysis => ({
  id: 'an_0123456789abcdef0123456789abcdef',
  ownerId: principal.userId,
  idempotencyKey: 'request-key-123',
  status,
  displayName: 'Wildcat',
  createdAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:00:00.000Z',
  expiresAt: '2026-09-02T12:00:00.000Z',
  expiredAt: null,
  failure: null,
  progress: null,
  execution: null,
});

const createRepository = (analysis = createStoredAnalysis()) => {
  let current = analysis;

  return {
    create: vi.fn(),
    findOwned: vi.fn(async (analysisId: string, ownerId: string) => {
      if (analysisId !== current.id || ownerId !== current.ownerId) {
        return undefined;
      }

      return current;
    }),
    transition: vi.fn(async (input) => {
      if (!input.expectedStatuses.includes(current.status)) {
        return 'invalid';
      }

      current = {
        ...current,
        status: input.status,
        updatedAt: '2026-08-31T12:01:00.000Z',
        failure: input.failure ?? null,
      };
      return current;
    }),
    cancel: vi.fn(async () => {
      if (!['draft', 'uploading', 'ready'].includes(current.status)) {
        return 'invalid';
      }

      current = {
        ...current,
        status: 'cancelled',
        updatedAt: '2026-08-31T12:01:00.000Z',
      };
      return current;
    }),
    queue: vi.fn(async () => {
      if (!['ready', 'queued'].includes(current.status)) {
        return 'invalid';
      }

      current = {
        ...current,
        status: 'queued',
        updatedAt: '2026-08-31T12:01:00.000Z',
      };
      return current;
    }),
  };
};

describe('AnalysisService', () => {
  it('creates a draft and removes internal owner/idempotency data from the result', async () => {
    const repository = createRepository();
    const stored = createStoredAnalysis();
    repository.create.mockResolvedValue({ analysis: stored, replayed: false });
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    const result = await service.create(principal, 'request-key-123', {
      displayName: 'Wildcat',
    });

    expect(result).toEqual({
      analysis: {
        id: stored.id,
        status: stored.status,
        displayName: stored.displayName,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        expiresAt: stored.expiresAt,
        expiredAt: stored.expiredAt,
        failure: stored.failure,
        progress: stored.progress,
        execution: stored.execution,
      },
      replayed: false,
    });
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('rejects a conflicting idempotency key', async () => {
    const repository = createRepository();
    repository.create.mockResolvedValue('conflict');
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    await expect(
      service.create(principal, 'request-key-123', {}),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('returns not found for an analysis owned by another user', async () => {
    const repository = createRepository();
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    await expect(
      service.find(
        { ...principal, userId: 'user_other' },
        createStoredAnalysis().id,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it.each(['draft', 'uploading', 'ready'] as const)(
    'cancels a %s analysis and makes cancellation idempotent',
    async (status) => {
      const repository = createRepository(createStoredAnalysis(status));
      const service = new AnalysisService(
        repository as never,
        {
          remove: vi.fn(),
        } as never,
      );
      const analysisId = createStoredAnalysis().id;

      await expect(
        service.cancel(principal, analysisId),
      ).resolves.toMatchObject({ status: 'cancelled' });
      await expect(
        service.cancel(principal, analysisId),
      ).resolves.toMatchObject({ status: 'cancelled' });
    },
  );

  it.each([
    ['draft', 'uploading'],
    ['draft', 'cancelled'],
    ['uploading', 'ready'],
    ['uploading', 'cancelled'],
    ['ready', 'queued'],
    ['ready', 'cancelled'],
    ['queued', 'running'],
    ['queued', 'cancelled'],
    ['running', 'succeeded'],
    ['running', 'failed'],
    ['running', 'queued'],
    ['running', 'cancelling'],
    ['cancelling', 'cancelled'],
  ] as const)('allows the internal %s -> %s transition', async (from, to) => {
    const repository = createRepository(createStoredAnalysis(from));
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );
    const failure: AnalysisFailure | null =
      to === 'failed'
        ? { code: 'ANALYSIS_FAILED', message: 'Analysis failed.' }
        : null;

    await expect(
      service.transitionInternal(
        createStoredAnalysis().id,
        principal.userId,
        to,
        failure,
      ),
    ).resolves.toMatchObject({ status: to });
  });

  it('rejects invalid internal transitions', async () => {
    const repository = createRepository(createStoredAnalysis('draft'));
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    await expect(
      service.transitionInternal(
        createStoredAnalysis().id,
        principal.userId,
        'succeeded',
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('accepts failure details only for the failed state', async () => {
    const repository = createRepository();
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    await expect(
      service.transitionInternal(
        createStoredAnalysis().id,
        principal.userId,
        'uploading',
        {
          code: 'UNEXPECTED',
          message: 'Unexpected.',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
    });
  });

  it('queues only a ready analysis through the durable queue repository operation', async () => {
    const repository = createRepository(createStoredAnalysis('ready'));
    const service = new AnalysisService(
      repository as never,
      {
        remove: vi.fn(),
      } as never,
    );

    await expect(
      service.queueAnalysis(principal, createStoredAnalysis().id),
    ).resolves.toMatchObject({ status: 'queued' });
    expect(repository.queue).toHaveBeenCalledWith(
      createStoredAnalysis().id,
      principal.userId,
      expect.any(Date),
    );
  });
});
