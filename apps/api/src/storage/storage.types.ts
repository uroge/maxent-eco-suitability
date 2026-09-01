import type {
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
  status: 'collecting' | 'ready' | 'aborted';
  shapefileBasename: string | undefined;
  uploadIds: string[];
  createdAt: string;
  expiresAt: string;
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
