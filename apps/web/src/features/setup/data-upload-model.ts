import type { ActiveUploadDataset, UploadDatasetFormat } from '@ecosuitability/contracts';
import type { DirectUploadFile } from '@/lib/direct-upload';

export const shapefileComponent = (file: File): DirectUploadFile['component'] => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'shp' ||
    extension === 'shx' ||
    extension === 'dbf' ||
    extension === 'prj' ||
    extension === 'cpg'
    ? extension
    : undefined;
};

export const fileIntent = (files: File[]): Array<Record<string, string | number>> =>
  files
    .map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

export const matchesRestoredFiles = (upload: ActiveUploadDataset, files: File[]): boolean => {
  if (upload.files.length === 0) {
    return files.length > 0;
  }
  const expected = [...upload.files].sort((left, right) =>
    left.originalName.localeCompare(right.originalName)
  );
  const selected = [...files].sort((left, right) => left.name.localeCompare(right.name));
  return (
    expected.length === selected.length &&
    expected.every(
      (file, index) =>
        file.originalName === selected[index]?.name && file.size === selected[index]?.size
    )
  );
};

export const formatAccept = (format: UploadDatasetFormat): string => {
  if (format === 'shapefile') {
    return '.shp,.shx,.dbf,.prj,.cpg';
  }
  if (format === 'geotiff' || format === 'geotiff-zip') {
    return '.tif,.tiff,.zip,image/tiff,application/zip';
  }
  return `.${format}`;
};
