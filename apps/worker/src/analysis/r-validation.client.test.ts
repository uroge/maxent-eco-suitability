import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RValidationClient } from './r-validation.client';
import { analysisArtifactSpecifications } from '@ecosuitability/contracts';

const secret = 'r-runtime-shared-secret-with-at-least-32-bytes';

const createClient = (lifecycle: object = {}, storage: object = {}) =>
  new RValidationClient(
    {
      getOrThrow: vi.fn((key: string) => {
        const values: Record<string, string | number> = {
          R_RUNTIME_URL: 'http://analysis-r:8080',
          R_RUNTIME_SHARED_SECRET: secret,
          R_RUNTIME_HTTP_TIMEOUT_MS: 10_000,
          R_RUNTIME_RUN_TIMEOUT_MS: 600_000,
          R_RUNTIME_INPUT_URL_TTL_SECONDS: 900,
          R_RUNTIME_OUTPUT_URL_TTL_SECONDS: 900,
        };
        return values[key];
      }),
    } as never,
    lifecycle as never,
    storage as never,
  );

describe('RValidationClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the domain-separated HMAC protocol for readiness requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: URL, init: RequestInit) => {
        const headers = new Headers(init.headers);
        const timestamp = headers.get('X-Run-Timestamp')!;
        const nonce = headers.get('X-Run-Nonce')!;
        const hash = headers.get('X-Run-Body-SHA256')!;
        const signingKey = createHmac('sha256', secret)
          .update('ecosuitability-r-runtime-v1')
          .digest();
        const expected = createHmac('sha256', signingKey)
          .update(`v1\nGET\n/health/ready\n${timestamp}\n${nonce}\n${hash}`)
          .digest('hex');
        expect(hash).toBe(createHash('sha256').update('').digest('hex'));
        expect(headers.get('X-Run-Signature')).toBe(expected);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }),
    );

    await expect(createClient().isReady()).resolves.toBe(true);
  });

  it('fails readiness closed when the runtime is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    await expect(createClient().isReady()).resolves.toBe(false);
  });

  it('executes the stable run protocol and issues output capabilities at artifacts-ready', async () => {
    const analysisId = 'an_0123456789abcdef0123456789abcdef';
    const artifacts = analysisArtifactSpecifications.map(
      (definition, index) => ({
        kind: definition.kind,
        size: index + 1,
        sha256: createHash('sha256').update(definition.kind).digest('hex'),
      }),
    );
    const responses = [
      {
        runId: `${analysisId}.1`,
        state: 'accepted',
        eventSequence: 0,
        generation: 1,
      },
      { runId: `${analysisId}.1`, state: 'running', eventSequence: 1 },
      {
        generation: 1,
        events: [
          {
            sequence: 1,
            stage: 'training',
            percent: 70,
            message: 'Training model.',
          },
        ],
        nextSequence: 1,
        hasMore: false,
        state: 'awaiting-output-capabilities',
        summary: null,
        artifacts,
        candidateCompletedAt: '2026-09-02T12:30:00.000Z',
        failureCode: null,
      },
      { runId: `${analysisId}.1`, state: 'running', eventSequence: 1 },
      {
        generation: 1,
        events: [
          {
            sequence: 2,
            stage: 'completed',
            percent: 100,
            message: 'Completed.',
          },
        ],
        nextSequence: 2,
        hasMore: false,
        state: 'succeeded',
        summary: {
          acceptedOccurrences: 10,
          deduplicatedOccurrences: 0,
          selectedPredictors: 1,
          validatedAt: '2026-09-02T12:00:00.000Z',
        },
        artifacts,
        candidateCompletedAt: '2026-09-02T12:30:00.000Z',
        failureCode: null,
      },
    ];
    const fetchMock = vi.fn(async (_input: URL, _init?: RequestInit) => {
      void _input;
      void _init;
      const body = responses.shift();
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue({
        fingerprint: 'a'.repeat(64),
        inputFingerprint: 'b'.repeat(64),
        configuration: {
          predictors: [{ datasetId: 'ds_0123456789abcdef0123456789abcdef' }],
        },
        inputManifest: {
          datasets: [
            {
              dataset: {
                id: 'ds_fedcba9876543210fedcba9876543210',
                kind: 'occurrence',
                format: 'csv',
              },
              files: [{ storageKey: 'input/occurrences.csv' }],
            },
            {
              dataset: {
                id: 'ds_0123456789abcdef0123456789abcdef',
                kind: 'predictor',
                format: 'geotiff',
              },
              files: [{ storageKey: 'input/temperature.tif' }],
            },
          ],
        },
      }),
    };
    const storage = {
      presignGet: vi.fn().mockResolvedValue('https://storage.example/input'),
    };
    const onEvent = vi.fn().mockResolvedValue(undefined);
    const onHeartbeat = vi.fn().mockResolvedValue(undefined);
    const onArtifactsReady = vi.fn().mockResolvedValue([]);
    const controller = new AbortController();

    await expect(
      createClient(lifecycle, storage).validate(
        analysisId,
        analysisId,
        2,
        controller.signal,
        onEvent,
        onHeartbeat,
        onArtifactsReady,
      ),
    ).resolves.toMatchObject({ artifacts });

    const createBody = JSON.parse(
      fetchMock.mock.calls[0]?.[1]?.body as string,
    ) as {
      runId: string;
      attempt: number;
    };
    expect(createBody).toMatchObject({ runId: `${analysisId}.1`, attempt: 2 });
    expect(onArtifactsReady).toHaveBeenCalledWith(
      artifacts,
      '2026-09-02T12:30:00.000Z',
    );
    expect(onHeartbeat).toHaveBeenCalledTimes(2);
  });

  it('resets event polling when the R runtime restores a newer generation', async () => {
    const analysisId = 'an_1123456789abcdef0123456789abcdef';
    const artifacts = analysisArtifactSpecifications.map(
      (definition, index) => ({
        kind: definition.kind,
        size: index + 1,
        sha256: createHash('sha256').update(definition.kind).digest('hex'),
      }),
    );
    const responses = [
      {
        runId: `${analysisId}.1`,
        state: 'running',
        eventSequence: 8,
        generation: 1,
      },
      { runId: `${analysisId}.1`, state: 'running', eventSequence: 8 },
      {
        generation: 2,
        events: [],
        nextSequence: 8,
        hasMore: false,
        state: 'awaiting-output-capabilities',
        summary: null,
        artifacts,
        candidateCompletedAt: '2026-09-02T12:30:00.000Z',
        failureCode: null,
      },
      {
        generation: 2,
        events: [
          {
            sequence: 1,
            stage: 'writing-artifacts',
            percent: 94,
            message: 'Recovered artifacts.',
          },
        ],
        nextSequence: 1,
        hasMore: false,
        state: 'awaiting-output-capabilities',
        summary: null,
        artifacts,
        candidateCompletedAt: '2026-09-02T12:30:00.000Z',
        failureCode: null,
      },
      { runId: `${analysisId}.1`, state: 'running', eventSequence: 1 },
      {
        generation: 2,
        events: [],
        nextSequence: 1,
        hasMore: false,
        state: 'succeeded',
        summary: {
          acceptedOccurrences: 10,
          deduplicatedOccurrences: 0,
          selectedPredictors: 1,
          validatedAt: '2026-09-02T12:00:00.000Z',
        },
        artifacts,
        candidateCompletedAt: '2026-09-02T12:30:00.000Z',
        failureCode: null,
      },
    ];
    const fetchMock = vi.fn(async (_input: URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const lifecycle = {
      executionSnapshot: vi.fn().mockResolvedValue({
        fingerprint: 'a'.repeat(64),
        inputFingerprint: 'b'.repeat(64),
        configuration: {
          predictors: [{ datasetId: 'ds_0123456789abcdef0123456789abcdef' }],
        },
        inputManifest: {
          datasets: [
            {
              dataset: {
                id: 'ds_fedcba9876543210fedcba9876543210',
                kind: 'occurrence',
                format: 'csv',
              },
              files: [{ storageKey: 'input/occurrences.csv' }],
            },
            {
              dataset: {
                id: 'ds_0123456789abcdef0123456789abcdef',
                kind: 'predictor',
                format: 'geotiff',
              },
              files: [{ storageKey: 'input/temperature.tif' }],
            },
          ],
        },
      }),
    };
    const onEvent = vi.fn().mockResolvedValue(undefined);

    await expect(
      createClient(lifecycle, {
        presignGet: vi.fn().mockResolvedValue('https://storage.example/input'),
      }).validate(
        analysisId,
        analysisId,
        1,
        new AbortController().signal,
        onEvent,
        vi.fn().mockResolvedValue(undefined),
        vi.fn().mockResolvedValue([]),
      ),
    ).resolves.toMatchObject({ artifacts });

    const eventRequests = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/events'));
    expect(eventRequests).toEqual([
      expect.stringContaining('afterSequence=8'),
      expect.stringContaining('afterSequence=0'),
      expect.stringContaining('afterSequence=1'),
    ]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 1 }),
      null,
      2,
    );
  });
});
