import type {
  AnalysisInputDataset,
  ShapefileComponent,
  UploadDatasetFormat,
  UploadDatasetKind,
} from '@ecosuitability/contracts';

export type DatasetSession = {
  id: string;
  analysisId: string;
  ownerId: string;
  idempotencyKey: string;
  fingerprint: string;
  kind: UploadDatasetKind;
  format: UploadDatasetFormat;
  status: 'collecting' | 'completing' | 'ready' | 'invalid' | 'aborted';
  shapefileBasename: string | undefined;
  uploadIds: string[];
  createdAt: string;
  expiresAt: string;
  completionClaimId: string | undefined;
  completionClaimExpiresAt: string | undefined;
};

export type UploadSession = {
  id: string;
  datasetId: string;
  analysisId: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  size: number;
  sha256: string;
  contentType: string | undefined;
  format: UploadDatasetFormat;
  kind: UploadDatasetKind;
  component: ShapefileComponent | undefined;
  multipartUploadId: string | undefined;
  status: 'pending' | 'completed' | 'aborted';
};

export type AnalysisInputManifest = {
  datasets: AnalysisInputDataset[];
};

export type CleanupRecord = {
  id: string;
  analysisId: string;
  objectKeys: string[];
  multipartUploads: Array<{ key: string; uploadId: string }>;
  attempt: number;
  nextAttemptAt: string;
  createdAt: string;
  claimId?: string;
  claimExpiresAt?: string;
};
