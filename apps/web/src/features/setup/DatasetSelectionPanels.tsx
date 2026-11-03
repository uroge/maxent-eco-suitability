'use client';

import {
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ecosuitability/ui';
import { UploadCloud } from 'lucide-react';
import { formatAccept } from './data-upload-model';
import type { OccurrenceFormat } from './upload-workflow-machine';

type DatasetSelectionPanelsProps = {
  format: OccurrenceFormat;
  hasOccurrence: boolean;
  occurrenceFiles: File[];
  onFormatChange: (format: OccurrenceFormat) => void;
  onOccurrenceFilesChange: (files: File[]) => void;
  onPredictorFilesChange: (files: File[]) => void;
  predictorFiles: File[];
};

export const DatasetSelectionPanels: React.FC<DatasetSelectionPanelsProps> = ({
  format,
  hasOccurrence,
  occurrenceFiles,
  onFormatChange,
  onOccurrenceFilesChange,
  onPredictorFilesChange,
  predictorFiles,
}) => (
  <div className="grid gap-6 lg:grid-cols-2">
    {!hasOccurrence ? (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Occurrence records</h2>
        <Select value={format} onValueChange={(value) => onFormatChange(value as OccurrenceFormat)}>
          <SelectTrigger aria-label="Occurrence format" className="mt-5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="xlsx">XLSX</SelectItem>
            <SelectItem value="geojson">GeoJSON</SelectItem>
            <SelectItem value="gpkg">GeoPackage</SelectItem>
            <SelectItem value="shapefile">Shapefile components</SelectItem>
          </SelectContent>
        </Select>
        <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm">
          <UploadCloud className="mb-2 text-primary" />
          Choose occurrence file{format === 'shapefile' ? 's' : ''}
          <span className="mt-1 text-xs text-muted-foreground">
            {occurrenceFiles.map((file) => file.name).join(', ') || 'No local file selected'}
          </span>
          <input
            accept={formatAccept(format)}
            className="sr-only"
            multiple={format === 'shapefile'}
            type="file"
            onChange={(event) => onOccurrenceFilesChange(Array.from(event.target.files ?? []))}
          />
        </label>
      </Card>
    ) : (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Occurrence records</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An occurrence dataset is attached. Use Replace above to preserve it until a new upload is
          verified.
        </p>
      </Card>
    )}
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Environmental predictors</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose individual GeoTIFFs or ZIP archives containing one GeoTIFF.
      </p>
      <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm">
        <UploadCloud className="mb-2 text-primary" />
        Choose predictor files
        <span className="mt-1 text-xs text-muted-foreground">
          {predictorFiles.map((file) => file.name).join(', ') || 'No local files selected'}
        </span>
        <input
          accept=".tif,.tiff,.zip,image/tiff,application/zip"
          className="sr-only"
          multiple
          type="file"
          onChange={(event) => onPredictorFilesChange(Array.from(event.target.files ?? []))}
        />
      </label>
    </Card>
  </div>
);
