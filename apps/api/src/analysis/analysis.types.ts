import type {
  Analysis,
  AnalysisArtifact,
  AnalysisFailure,
  AnalysisExecution,
  AnalysisProgress,
  AnalysisStatus,
  IdempotencyKey,
  AnalysisResultManifest,
  AnalysisConfiguration,
  AnalysisInputDataset,
  AnalysisInputProfile,
  AnalysisPreflight,
} from '@ecosuitability/contracts';

export type StoredResultManifest = Omit<AnalysisResultManifest, 'artifacts'> & {
  artifacts: Array<AnalysisArtifact & { storageKey: string }>;
};

export type StoredAnalysis = Analysis & {
  ownerId: string;
  idempotencyKey: IdempotencyKey;
  occurrenceDatasetId?: string;
  progress: AnalysisProgress | null;
  execution: AnalysisExecution | null;
  resultManifest?: StoredResultManifest;
  configuration?: AnalysisConfiguration;
  configurationFingerprint?: string;
  inputProfile?: AnalysisInputProfile;
  preflight?: AnalysisPreflight;
  mapAssets?: Array<{
    id: string;
    datasetId: string;
    label: string;
    storageKey: string;
    terrainEligible: boolean;
  }>;
  executionSnapshot?: {
    configuration: AnalysisConfiguration;
    inputRevision: number;
    configurationRevision: number;
    revision?: number;
    fingerprint: string;
    inputManifest: {
      datasets: AnalysisInputDataset[];
    };
    inputFingerprint: string;
    queuedAt: string;
    processingExpiresAt: string;
    seed: number;
  };
};

export type AnalysisOutbox = {
  analysisId: string;
  ownerId: string;
  jobId: string;
  status: 'pending' | 'dispatched';
  createdAt: string;
  dispatchedAt: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
};

export type CreateStoredAnalysisInput = {
  analysis: StoredAnalysis;
  fingerprint: string;
};

export type CreateStoredAnalysisResult = {
  analysis: StoredAnalysis;
  replayed: boolean;
};

export type TransitionAnalysisInput = {
  analysisId: string;
  ownerId: string;
  expectedStatuses: AnalysisStatus[];
  status: AnalysisStatus;
  failure?: AnalysisFailure | null;
};
