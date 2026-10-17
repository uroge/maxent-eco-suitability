'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  analysisConfigurationResponseSchema,
  analysisConfigurationSchema,
  analysisInputManifestResponseSchema,
  type AnalysisConfiguration,
} from '@ecosuitability/contracts';
import type { z } from 'zod';
import { Alert, Button, Card, Checkbox, FormField, Input } from '@ecosuitability/ui';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { SetupShell } from './SetupShell';

const variableName = (name: string, index: number): string => {
  const normalized = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^[^A-Za-z]+/, '')
    .slice(0, 64);
  return normalized || `predictor_${index + 1}`;
};

export const ConfigurationScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });
  const saved = useQuery({
    queryKey: analysisKeys.configuration(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/configuration`, analysisConfigurationResponseSchema),
  });
  const predictors = useMemo(
    () => inputs.data?.inputs.datasets.filter((entry) => entry.dataset.kind === 'predictor') ?? [],
    [inputs.data]
  );
  const occurrence = inputs.data?.inputs.datasets.find(
    (entry) => entry.dataset.kind === 'occurrence'
  );
  const form = useForm<z.input<typeof analysisConfigurationSchema>, unknown, AnalysisConfiguration>(
    {
      resolver: zodResolver(analysisConfigurationSchema),
    }
  );

  useEffect(() => {
    if (!occurrence || predictors.length === 0 || saved.isLoading) {
      return;
    }
    if (saved.data?.configuration) {
      form.reset(saved.data.configuration);
      return;
    }
    const format = occurrence.dataset.format;
    const occurrenceConfiguration =
      format === 'csv'
        ? { format, longitudeColumn: 'longitude', latitudeColumn: 'latitude' }
        : format === 'xlsx'
          ? {
              format,
              worksheet: 'Sheet1',
              longitudeColumn: 'longitude',
              latitudeColumn: 'latitude',
            }
          : format === 'gpkg'
            ? { format }
            : { format: format as 'geojson' | 'shapefile' };
    form.reset(
      analysisConfigurationSchema.parse({
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
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      })
    );
  }, [form, occurrence, predictors, saved.data, saved.isLoading]);

  const submit = form.handleSubmit(async (configuration) => {
    const response = await api.request(`/v1/analyses/${analysisId}/configuration`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey('configuration', analysisId),
      },
      body: JSON.stringify({ expectedRevision: saved.data?.revision ?? 0, configuration }),
    });
    if (!response.ok) {
      form.setError('root', {
        message: 'The inputs or configuration revision changed. Reload and try again.',
      });
      return;
    }
    const preflight = await api.request(`/v1/analyses/${analysisId}/preflight`, { method: 'POST' });
    if (!preflight.ok) {
      form.setError('root', { message: 'Configuration saved, but preflight could not be queued.' });
      return;
    }
    router.push(`/analyses/${analysisId}/setup/review`);
  });
  const method = useWatch({ control: form.control, name: 'validation.method' });
  const terrain = useWatch({ control: form.control, name: 'visualization.terrain' });

  return (
    <SetupShell
      analysisId={analysisId}
      current="configuration"
      title="Configure the model"
      description="Resolve format-specific mappings, name predictors, choose validation, and set reproducible maxnet parameters. Variable importance is only available after execution."
    >
      <form className="space-y-6" onSubmit={submit}>
        {form.formState.errors.root?.message ? (
          <Alert variant="destructive">{form.formState.errors.root.message}</Alert>
        ) : null}
        <Card className="grid gap-5 p-6 lg:grid-cols-2">
          <FormField
            htmlFor="species"
            label="Species name"
            error={form.formState.errors.speciesName?.message}
          >
            <Input
              id="species"
              invalid={Boolean(form.formState.errors.speciesName)}
              {...form.register('speciesName')}
            />
          </FormField>
          {occurrence?.dataset.format === 'csv' || occurrence?.dataset.format === 'xlsx' ? (
            <>
              <FormField htmlFor="longitude" label="Longitude column">
                <Input id="longitude" {...form.register('occurrence.longitudeColumn')} />
              </FormField>
              <FormField htmlFor="latitude" label="Latitude column">
                <Input id="latitude" {...form.register('occurrence.latitudeColumn')} />
              </FormField>
            </>
          ) : null}
          {occurrence?.dataset.format === 'xlsx' ? (
            <FormField htmlFor="worksheet" label="Worksheet">
              <Input id="worksheet" {...form.register('occurrence.worksheet')} />
            </FormField>
          ) : null}
          {occurrence?.dataset.format === 'gpkg' ? (
            <FormField
              htmlFor="layer"
              label="GeoPackage layer"
              description="Leave blank only when the file contains one spatial layer."
            >
              <Input id="layer" {...form.register('occurrence.layer')} />
            </FormField>
          ) : null}
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Predictors</h2>
          <div className="mt-5 space-y-4">
            {predictors.map((entry, index) => (
              <div
                className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[1fr_12rem]"
                key={entry.dataset.id}
              >
                <div>
                  <p className="mb-2 font-mono text-xs text-muted-foreground">
                    {entry.files[0]?.originalName}
                  </p>
                  <Input
                    aria-label={`Variable name for ${entry.files[0]?.originalName}`}
                    {...form.register(`predictors.${index}.variableName`)}
                  />
                  <input type="hidden" {...form.register(`predictors.${index}.datasetId`)} />
                </div>
                <select
                  className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
                  {...form.register(`predictors.${index}.type`)}
                >
                  <option value="continuous">Continuous</option>
                  <option value="categorical">Categorical</option>
                </select>
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-5 p-6">
            <h2 className="text-lg font-semibold">Sampling and model</h2>
            <FormField htmlFor="background" label="Background points">
              <Input
                id="background"
                type="number"
                min={1000}
                max={100000}
                {...form.register('background.pointCount', { valueAsNumber: true })}
              />
            </FormField>
            <FormField htmlFor="regularization" label="Regularization multiplier">
              <Input
                id="regularization"
                type="number"
                min={0.5}
                max={5}
                step={0.1}
                {...form.register('model.regularizationMultiplier', { valueAsNumber: true })}
              />
            </FormField>
            <Alert variant="information">
              Exact duplicate coordinates are always removed deterministically and reported.
            </Alert>
          </Card>
          <Card className="space-y-5 p-6">
            <h2 className="text-lg font-semibold">Evaluation</h2>
            <label className="flex min-h-10 items-center gap-3">
              <input
                type="radio"
                value="train-test-split"
                {...form.register('validation.method')}
              />
              Train/test split
            </label>
            <label className="flex min-h-10 items-center gap-3">
              <input type="radio" value="k-fold" {...form.register('validation.method')} />
              K-fold evaluation
            </label>
            {method === 'k-fold' ? (
              <FormField htmlFor="folds" label="Folds">
                <Input
                  id="folds"
                  type="number"
                  min={2}
                  max={10}
                  {...form.register('validation.folds', { valueAsNumber: true })}
                />
              </FormField>
            ) : (
              <FormField htmlFor="test-fraction" label="Held-out fraction">
                <Input
                  id="test-fraction"
                  type="number"
                  min={0.1}
                  max={0.5}
                  step={0.05}
                  {...form.register('validation.testFraction', { valueAsNumber: true })}
                />
              </FormField>
            )}
            <FormField htmlFor="seed" label="Random seed">
              <Input
                id="seed"
                className="font-mono"
                type="number"
                {...form.register('seed', { valueAsNumber: true })}
              />
            </FormField>
          </Card>
        </div>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Optional 3D terrain</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Terrain is presentation-only and never changes model training. Enable it only for a
            continuous predictor that is truly elevation in metres.
          </p>
          <label className="mt-4 flex items-start gap-3">
            <Checkbox
              checked={Boolean(terrain)}
              onCheckedChange={(checked) => {
                const predictor = predictors.find(
                  (_, index) => form.getValues(`predictors.${index}.type`) === 'continuous'
                );
                form.setValue(
                  'visualization.terrain',
                  checked && predictor
                    ? { datasetId: predictor.dataset.id, semanticType: 'elevation', unit: 'metres' }
                    : null
                );
              }}
            />
            <span className="text-sm">
              I confirm the selected continuous predictor represents elevation in metres.
            </span>
          </label>
        </Card>
        <div className="flex justify-between">
          <Button asChild variant="secondary">
            <Link href={`/analyses/${analysisId}/setup/validation`}>Back</Link>
          </Button>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Save and run preflight
          </Button>
        </div>
      </form>
    </SetupShell>
  );
};
