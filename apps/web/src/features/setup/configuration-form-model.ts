import type { UseFormReturn } from 'react-hook-form';
import {
  analysisConfigurationSchema,
  type AnalysisConfiguration,
  type AnalysisConfigurationResponse,
  type AnalysisInputManifestResponse,
  type AnalysisInputProfile,
  type AnalysisInputProfileResponse,
  type OccurrenceSourceProfile,
} from '@ecosuitability/contracts';
import type { z } from 'zod';

export const noSelection = '__none__';

export type ConfigurationFormInput = z.input<typeof analysisConfigurationSchema>;

export type ConfigurationFormApi = UseFormReturn<
  ConfigurationFormInput,
  unknown,
  AnalysisConfiguration
>;

export type InputDataset = AnalysisInputManifestResponse['inputs']['datasets'][number];

export const variableName = (name: string, index: number): string => {
  const normalized = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .slice(0, 64);
  return normalized || `predictor_${index + 1}`;
};

const uniqueOrEmpty = (values: string[]): string => (values.length === 1 ? values[0]! : '');

const seedFromAnalysisId = (analysisId: string): number => {
  let hash = 2_166_136_261;
  for (const character of analysisId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

export const sourceFallback = (profile: AnalysisInputProfile): OccurrenceSourceProfile => ({
  source: null,
  columns: profile.occurrence.columns,
  longitudeCandidates: profile.occurrence.longitudeCandidates,
  latitudeCandidates: profile.occurrence.latitudeCandidates,
  speciesCandidates: profile.occurrence.speciesCandidates,
  recordCount: profile.occurrence.recordCount,
  geometryType: null,
});

export const createDefaultConfiguration = (
  analysisId: string,
  inputs: AnalysisInputManifestResponse,
  profile: AnalysisInputProfileResponse,
  saved: AnalysisConfigurationResponse
): ConfigurationFormInput => {
  if (saved.configuration) {
    return saved.configuration;
  }

  const occurrence = inputs.inputs.datasets.find((entry) => entry.dataset.kind === 'occurrence');
  const predictors = inputs.inputs.datasets.filter((entry) => entry.dataset.kind === 'predictor');
  if (!occurrence) {
    throw new Error('An occurrence dataset is required before configuration.');
  }
  const profiled = profile.profile;
  const sources = profiled.occurrence.sources.length
    ? profiled.occurrence.sources
    : [sourceFallback(profiled)];
  const selectedSource = sources.length === 1 ? sources[0] : undefined;
  const format = occurrence.dataset.format;
  const occurrenceConfiguration =
    format === 'csv'
      ? {
          format,
          longitudeColumn: uniqueOrEmpty(selectedSource?.longitudeCandidates ?? []),
          latitudeColumn: uniqueOrEmpty(selectedSource?.latitudeCandidates ?? []),
          speciesColumn: uniqueOrEmpty(selectedSource?.speciesCandidates ?? []) || undefined,
        }
      : format === 'xlsx'
        ? {
            format,
            worksheet: sources.length === 1 ? (sources[0]?.source ?? '') : '',
            longitudeColumn: uniqueOrEmpty(selectedSource?.longitudeCandidates ?? []),
            latitudeColumn: uniqueOrEmpty(selectedSource?.latitudeCandidates ?? []),
            speciesColumn: uniqueOrEmpty(selectedSource?.speciesCandidates ?? []) || undefined,
          }
        : format === 'gpkg'
          ? {
              format,
              layer: sources.length === 1 ? (sources[0]?.source ?? undefined) : undefined,
            }
          : { format: format as 'geojson' | 'shapefile' };

  return {
    schemaVersion: 1,
    speciesName: '',
    occurrence: occurrenceConfiguration,
    predictors: predictors.map((entry, index) => ({
      datasetId: entry.dataset.id,
      variableName: variableName(entry.files[0]?.originalName ?? '', index),
      type: 'continuous',
    })),
    studyArea: { strategy: 'predictor-intersection' },
    inputValidation: {
      coordinatePolicy: 'reject-all',
      coveragePolicy: 'require-all',
      minimumCoveragePercent: 100,
    },
    background: { strategy: 'random', pointCount: 10000 },
    model: {
      featureClasses: ['linear', 'quadratic', 'product', 'hinge'],
      regularizationMultiplier: 1,
    },
    validation: { method: 'train-test-split', testFraction: 0.2 },
    visualization: { terrain: null },
    seed: seedFromAnalysisId(analysisId),
  };
};
