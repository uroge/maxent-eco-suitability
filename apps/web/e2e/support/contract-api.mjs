import { createServer } from 'node:http';

const port = Number(process.env.E2E_CONTRACT_API_PORT ?? 4010);
const analysisId = 'an_0123456789abcdef0123456789abcdef';
const occurrenceId = 'ds_11111111111111111111111111111111';
const predictorId = 'ds_22222222222222222222222222222222';
const fingerprint = `jcs-sha256-v1:${'a'.repeat(64)}`;
const configurationFingerprint = `jcs-sha256-v1:${'b'.repeat(64)}`;
const createdAt = '2026-11-03T09:00:00.000Z';
const expiresAt = '2099-11-05T09:00:00.000Z';
const tile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const state = {
  status: 'draft',
  inputRevision: 0,
  configurationRevision: 0,
  configuration: null,
  datasets: [],
  pendingDatasets: new Map(),
  runReads: 0,
};

const cors = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3000',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'ETag, Content-Disposition',
};

const sendJson = (response, value, status = 200) => {
  response.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
};

const analysis = () => ({
  id: analysisId,
  status: state.status,
  displayName: state.configuration?.speciesName ?? null,
  inputRevision: state.inputRevision,
  configurationRevision: state.configurationRevision,
  createdAt,
  updatedAt: createdAt,
  expiresAt,
  expiredAt: null,
  queuedAt: ['queued', 'running', 'succeeded'].includes(state.status) ? createdAt : null,
  startedAt: ['running', 'succeeded'].includes(state.status) ? createdAt : null,
  completedAt: state.status === 'succeeded' ? '2026-11-03T09:05:00.000Z' : null,
  cancelledAt: null,
  failure: null,
  progress:
    state.status === 'queued'
      ? { stage: 'queued', percent: 0, attempt: 1, message: 'Queued', updatedAt: createdAt }
      : state.status === 'running'
        ? {
            stage: 'training',
            percent: 65,
            attempt: 1,
            message: 'Training maxnet model',
            updatedAt: createdAt,
          }
        : state.status === 'succeeded'
          ? {
              stage: 'completed',
              percent: 100,
              attempt: 1,
              message: 'Analysis complete',
              updatedAt: createdAt,
            }
          : null,
  execution: ['queued', 'running', 'succeeded'].includes(state.status)
    ? { jobId: 'contract-job', attempt: 1, outboxDispatchedAt: createdAt }
    : null,
});

const uploadDataset = (id, kind, format) => ({
  id,
  analysisId,
  kind,
  format,
  status: 'ready',
  createdAt,
  expiresAt,
});

const inputFile = (id, name, contentType) => ({
  uploadId: `up_${id.slice(3)}`,
  originalName: name,
  size: 128,
  declaredSha256: 'c'.repeat(64),
  sha256Verification: 'client-declared',
  contentType,
  component: null,
});

const inputs = () => ({
  analysisId,
  inputRevision: state.inputRevision,
  datasets: state.datasets.map((entry) => ({
    dataset: uploadDataset(entry.id, entry.kind, entry.format),
    files: [inputFile(entry.id, entry.name, entry.contentType)],
    attachedAt: createdAt,
  })),
});

const profile = {
  analysisId,
  inputRevision: 2,
  inputFingerprint: fingerprint,
  policyVersion: '2026-10-01',
  status: 'passed',
  progress: 100,
  checks: [
    {
      id: 'rasters.grid.alignment',
      label: 'Raster alignment',
      status: 'passed',
      message: 'Predictor grids share the same geometry.',
    },
  ],
  warnings: [],
  blockers: [],
  occurrence: {
    columns: ['species', 'longitude', 'latitude'],
    layers: [],
    longitudeCandidates: ['longitude'],
    latitudeCandidates: ['latitude'],
    speciesCandidates: ['species'],
    recordCount: 12,
    duplicateCoordinateCount: 0,
    crs: 'EPSG:4326',
    sources: [],
  },
  rasters: [
    {
      datasetId: predictorId,
      crs: 'EPSG:4326',
      bounds: [18, 44, 20, 46],
      width: 10,
      height: 10,
      resolution: [0.2, 0.2],
      bandCount: 1,
      nodata: null,
      alignedToReference: true,
    },
  ],
  spatialPreview: { type: 'FeatureCollection', features: [] },
  createdAt,
  completedAt: createdAt,
};

const configurationResponse = () => ({
  mode: 'editable',
  configuration: state.configuration,
  revision: state.configurationRevision,
  ...(state.configuration ? { fingerprint: configurationFingerprint } : {}),
});

const preflight = () => ({
  analysisId,
  inputRevision: 2,
  configurationRevision: 1,
  inputFingerprint: fingerprint,
  configurationFingerprint,
  policyVersion: '2026-10-01',
  status: 'passed',
  progress: 100,
  checks: profile.checks,
  warnings: [],
  blockers: [],
  createdAt,
  completedAt: createdAt,
});

const metrics = {
  schemaVersion: 2,
  method: 'train-test-split',
  folds: 1,
  pooledRoc: [
    { falsePositiveRate: 0, truePositiveRate: 0, threshold: 1 },
    { falsePositiveRate: 1, truePositiveRate: 1, threshold: 0 },
  ],
  evaluationRuns: [{ run: 1, auc: 0.91, presenceCount: 12, backgroundCount: 1000 }],
  auc: { mean: 0.91, standardDeviation: 0, minimum: 0.91, maximum: 0.91 },
  threshold: {
    threshold: 0.53,
    sensitivity: 0.84,
    specificity: 0.8,
    truePositive: 10,
    falseNegative: 2,
    trueNegative: 800,
    falsePositive: 200,
  },
};

const artifacts = [
  ['execution-summary', 'execution-summary.json', 'application/json'],
  ['metrics', 'metrics.json', 'application/json'],
  ['variable-importance', 'variable-importance.json', 'application/json'],
  ['response-curves', 'response-curves.json', 'application/json'],
  ['suitability-raster', 'suitability.tif', 'image/tiff'],
  ['suitability-threshold-raster', 'suitability-threshold.tif', 'image/tiff'],
  ['occurrences', 'occurrences.geojson', 'application/geo+json'],
  ['background', 'background.geojson', 'application/geo+json'],
  ['run-log', 'run.log.txt', 'text/plain; charset=utf-8'],
  ['result-bundle', 'ecosuitability-results.zip', 'application/zip'],
].map(([kind, filename, contentType], index) => ({
  id: `ar_${String(index).padStart(32, '0')}`,
  kind,
  filename,
  contentType,
  size: 128,
  sha256: 'd'.repeat(64),
  sha256Verification: 'worker-verified',
  createdAt,
}));

const requireHeaders = (request, response, mutation = false) => {
  if (!request.headers.authorization?.startsWith('Bearer ')) {
    sendJson(response, { error: 'Missing bearer authorization.' }, 401);
    return false;
  }
  if (mutation && !request.headers['idempotency-key']) {
    sendJson(response, { error: 'Missing idempotency key.' }, 400);
    return false;
  }
  return true;
};

const readJson = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  if (url.pathname === '/health') {
    sendJson(response, { ok: true });
    return;
  }
  if (url.pathname.startsWith('/storage/') && request.method === 'PUT') {
    for await (const chunk of request) {
      // Consume the browser upload without retaining scientific input data.
      void chunk;
    }
    response.writeHead(200, { ...cors, ETag: '"contract-etag"' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/download/')) {
    response.writeHead(200, {
      ...cors,
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="ecosuitability-results.zip"',
    });
    response.end('contract bundle');
    return;
  }
  if (!url.pathname.startsWith('/v1/')) {
    sendJson(response, { error: 'Not found.' }, 404);
    return;
  }

  const mutation =
    request.method !== 'GET' &&
    !url.pathname.includes('/results/') &&
    !url.pathname.includes('/map/');
  if (!requireHeaders(request, response, mutation)) {
    return;
  }

  if (url.pathname === '/v1/analyses' && request.method === 'POST') {
    sendJson(response, { analysis: analysis() }, 201);
    return;
  }
  if (url.pathname === `/v1/analyses/${analysisId}` && request.method === 'GET') {
    if (state.status === 'queued' && state.runReads > 0) {
      state.status = 'running';
    } else if (state.status === 'running' && state.runReads > 1) {
      state.status = 'succeeded';
    }
    if (['queued', 'running'].includes(state.status)) {
      state.runReads += 1;
    }
    sendJson(response, { analysis: analysis() });
    return;
  }
  if (url.pathname === `/v1/analyses/${analysisId}/inputs` && request.method === 'GET') {
    sendJson(response, { inputs: inputs() });
    return;
  }
  if (url.pathname === `/v1/analyses/${analysisId}/upload-datasets` && request.method === 'GET') {
    sendJson(response, { uploads: [] });
    return;
  }
  if (url.pathname === `/v1/analyses/${analysisId}/upload-datasets` && request.method === 'POST') {
    const body = await readJson(request);
    const id = body.kind === 'occurrence' ? occurrenceId : predictorId;
    state.pendingDatasets.set(id, { id, kind: body.kind, format: body.format });
    sendJson(response, { dataset: uploadDataset(id, body.kind, body.format) }, 201);
    return;
  }
  const fileCreate = url.pathname.match(/\/upload-datasets\/(ds_[a-z0-9]+)\/files$/);
  if (fileCreate && request.method === 'POST') {
    const body = await readJson(request);
    const id = `up_${fileCreate[1].slice(3)}`;
    const pending = state.pendingDatasets.get(fileCreate[1]);
    Object.assign(pending, {
      name: body.originalName,
      contentType: body.contentType ?? null,
    });
    sendJson(response, {
      file: {
        id,
        multipart: false,
        status: 'pending',
        uploadUrl: `http://127.0.0.1:${port}/storage/${id}`,
        partSizeBytes: null,
      },
    });
    return;
  }
  if (url.pathname.includes('/files/') && url.pathname.endsWith('/complete')) {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  const datasetComplete = url.pathname.match(/\/upload-datasets\/(ds_[a-z0-9]+)\/complete$/);
  if (datasetComplete && request.method === 'POST') {
    const pending = state.pendingDatasets.get(datasetComplete[1]);
    if (pending && !state.datasets.some((entry) => entry.id === pending.id)) {
      state.datasets.push(pending);
      state.inputRevision += 1;
    }
    sendJson(response, { dataset: uploadDataset(pending.id, pending.kind, pending.format) });
    return;
  }
  if (url.pathname.endsWith('/inputs/complete') && request.method === 'POST') {
    state.status = 'ready';
    sendJson(response, { analysis: analysis() });
    return;
  }
  if (url.pathname.endsWith('/input-profile')) {
    sendJson(response, { profile }, request.method === 'POST' ? 202 : 200);
    return;
  }
  if (url.pathname.endsWith('/configuration') && request.method === 'GET') {
    sendJson(response, configurationResponse());
    return;
  }
  if (url.pathname.endsWith('/configuration') && request.method === 'PUT') {
    const body = await readJson(request);
    state.configuration = body.configuration;
    state.configurationRevision = 1;
    sendJson(response, configurationResponse());
    return;
  }
  if (url.pathname.endsWith('/preflight')) {
    sendJson(response, { preflight: preflight() }, request.method === 'POST' ? 202 : 200);
    return;
  }
  if (url.pathname.endsWith('/queue') && request.method === 'POST') {
    state.status = 'queued';
    state.runReads = 0;
    sendJson(response, { analysis: analysis() }, 202);
    return;
  }
  if (url.pathname.endsWith('/results/overview')) {
    sendJson(response, {
      overview: {
        analysisId,
        displayName: state.configuration.speciesName,
        completedAt: '2026-11-03T09:05:00.000Z',
        resultExpiresAt: expiresAt,
        metrics,
        validation: {
          acceptedOccurrences: 12,
          deduplicatedOccurrences: 0,
          invalidCoordinateOccurrences: 0,
          uncoveredOccurrences: 0,
          coveragePercent: 100,
          selectedPredictors: 1,
          validatedAt: createdAt,
        },
        configuration: state.configuration,
      },
    });
    return;
  }
  if (url.pathname.endsWith('/results/diagnostics')) {
    sendJson(response, {
      diagnostics: {
        metrics,
        importance: {
          schemaVersion: 1,
          variables: [{ variable: 'synthetic_elevation', importance: 1, percent: 100 }],
        },
        responseCurves: {
          schemaVersion: 1,
          curves: [
            {
              variable: 'synthetic_elevation',
              type: 'continuous',
              values: [0, 1],
              suitability: [0.1, 0.9],
            },
          ],
        },
      },
    });
    return;
  }
  if (url.pathname === `/v1/analyses/${analysisId}/results`) {
    sendJson(response, {
      result: {
        analysisId,
        completedAt: '2026-11-03T09:05:00.000Z',
        resultExpiresAt: expiresAt,
        reproducibility: {
          inputRevision: 2,
          configurationRevision: 1,
          inputFingerprint: fingerprint,
          configurationFingerprint,
          seed: state.configuration.seed,
        },
        artifacts,
      },
    });
    return;
  }
  if (url.pathname.match(/\/results\/ar_[a-z0-9]+\/download$/) && request.method === 'POST') {
    sendJson(response, {
      downloadUrl: `http://127.0.0.1:${port}/download/results.zip`,
      expiresAt: expiresAt,
    });
    return;
  }
  if (url.pathname.endsWith('/map/capabilities')) {
    sendJson(response, {
      capabilities: {
        analysisId,
        basemaps: [],
        layers: [
          {
            id: 'ar_00000000000000000000000000000004',
            label: 'Suitability',
            kind: 'suitability',
            dataType: 'raster',
            legend: [
              { label: 'Low', value: 0, color: '#440154' },
              { label: 'High', value: 1, color: '#fde725' },
            ],
          },
          {
            id: 'ar_00000000000000000000000000000006',
            label: 'Occurrences',
            kind: 'occurrences',
            dataType: 'vector',
            legend: [],
          },
        ],
        terrain: { available: false, layerId: null, unavailableReason: 'No DEM selected.' },
        bounds: [18, 44, 20, 46],
      },
    });
    return;
  }
  if (url.pathname.includes('/map/tiles/')) {
    response.writeHead(200, { ...cors, 'Content-Type': 'image/png' });
    response.end(tile);
    return;
  }
  if (url.pathname.includes('/map/vectors/')) {
    sendJson(response, { type: 'FeatureCollection', features: [] });
    return;
  }
  if (url.pathname.endsWith('/map/inspect')) {
    sendJson(response, {
      inspection: {
        longitude: Number(url.searchParams.get('longitude')),
        latitude: Number(url.searchParams.get('latitude')),
        suitability: 0.82,
        thresholdClass: 1,
        predictors: { synthetic_elevation: 320 },
        nearestOccurrenceMetres: 125,
      },
    });
    return;
  }

  sendJson(response, { error: `Unhandled contract route: ${request.method} ${url.pathname}` }, 404);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Contract API listening on http://127.0.0.1:${port}\n`);
});
