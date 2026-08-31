import type {
  UploadDatasetFormat,
  UploadDatasetKind,
} from '@ecosuitability/contracts';

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
  multipartUploadId: string | undefined;
  status: 'pending' | 'completed';
};
