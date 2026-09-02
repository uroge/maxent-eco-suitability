import type {
  Analysis,
  AnalysisFailure,
  AnalysisExecution,
  AnalysisProgress,
  AnalysisStatus,
  IdempotencyKey,
} from '@ecosuitability/contracts';

export type StoredAnalysis = Analysis & {
  ownerId: string;
  idempotencyKey: IdempotencyKey;
  occurrenceDatasetId?: string;
  progress: AnalysisProgress | null;
  execution: AnalysisExecution | null;
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
