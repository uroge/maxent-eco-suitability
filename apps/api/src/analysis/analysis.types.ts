import type {
  Analysis,
  AnalysisFailure,
  AnalysisStatus,
  IdempotencyKey,
} from '@ecosuitability/contracts';

export type StoredAnalysis = Analysis & {
  ownerId: string;
  idempotencyKey: IdempotencyKey;
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
