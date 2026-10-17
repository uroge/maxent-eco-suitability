'use client';

import { SignInButton, useAuth } from '@clerk/nextjs';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { AnalysisConfiguration } from '@ecosuitability/contracts';
import { createApiClient } from '@/lib/api-client';
import { uploadDataset } from '@/lib/direct-upload';

type AnalysisResponse = { analysis: { id: string } };

type ConfigurationResponse = { revision: number };

type OccurrenceFormat = 'csv' | 'xlsx' | 'geojson' | 'shapefile';

const createKey = (): string => crypto.randomUUID();

const componentFor = (file: File): 'shp' | 'shx' | 'dbf' | 'prj' | 'cpg' | undefined => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'shp' ||
    extension === 'shx' ||
    extension === 'dbf' ||
    extension === 'prj' ||
    extension === 'cpg'
    ? extension
    : undefined;
};

const responseJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error('The API rejected this step. Review the inputs and try again.');
  }

  return response.json() as Promise<T>;
};

export function AnalysisWorkflow() {
  const { getToken, isSignedIn } = useAuth();
  const [analysisId, setAnalysisId] = useState<string>();
  const [occurrenceFiles, setOccurrenceFiles] = useState<File[]>([]);
  const [predictorFiles, setPredictorFiles] = useState<File[]>([]);
  const [predictorIds, setPredictorIds] = useState<string[]>([]);
  const [format, setFormat] = useState<OccurrenceFormat>('csv');
  const [speciesName, setSpeciesName] = useState('');
  const [longitudeColumn, setLongitudeColumn] = useState('longitude');
  const [latitudeColumn, setLatitudeColumn] = useState('latitude');
  const [worksheet, setWorksheet] = useState('Sheet1');
  const [status, setStatus] = useState('Create an analysis to begin.');
  const [busy, setBusy] = useState(false);

  if (!isSignedIn) {
    return (
      <main className="flex flex-1 items-center justify-center bg-stone-100 px-6 py-16 text-foreground">
        <section className="max-w-md rounded-2xl border border-border bg-surface p-8 shadow-overlay">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            EcoSuitability
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Sign in to create an analysis.
          </h1>
          <div className="mt-6">
            <SignInButton>
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Sign in
              </button>
            </SignInButton>
          </div>
        </section>
      </main>
    );
  }

  const api = createApiClient(getToken);

  const createAnalysis = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await responseJson<AnalysisResponse>(
        await api.request('/v1/analyses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createKey() },
          body: JSON.stringify({ displayName: speciesName || undefined }),
        })
      );
      setAnalysisId(result.analysis.id);
      setStatus('Draft created. Upload one occurrence dataset and one or more GeoTIFF predictors.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to create the draft.');
    } finally {
      setBusy(false);
    }
  };

  const uploadInputs = async (): Promise<void> => {
    if (!analysisId || occurrenceFiles.length === 0 || predictorFiles.length === 0) {
      setStatus('Choose one occurrence dataset and at least one predictor before uploading.');
      return;
    }
    setBusy(true);
    try {
      await uploadDataset(
        api,
        analysisId,
        'occurrence',
        format,
        occurrenceFiles.map((file) => ({ file, component: componentFor(file) })),
        {
          idempotencyKey: createKey(),
          onProgress: ({ loadedBytes, totalBytes }) =>
            setStatus(`Uploading occurrences: ${Math.round((loadedBytes / totalBytes) * 100)}%.`),
        }
      );
      const uploadedPredictorIds = await Promise.all(
        predictorFiles.map((file) =>
          uploadDataset(api, analysisId, 'predictor', 'geotiff', [{ file }], {
            idempotencyKey: createKey(),
          })
        )
      );
      setPredictorIds(uploadedPredictorIds);
      await responseJson(
        await api.request(`/v1/analyses/${analysisId}/inputs/complete`, { method: 'POST' })
      );
      setStatus('Inputs are ready. Save the immutable analysis configuration.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveAndQueue = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!analysisId || predictorIds.length === 0) {
      setStatus('Complete the input upload before saving configuration.');
      return;
    }
    const occurrence =
      format === 'csv'
        ? { format, longitudeColumn, latitudeColumn }
        : format === 'xlsx'
          ? { format, worksheet, longitudeColumn, latitudeColumn }
          : { format };
    const configuration: AnalysisConfiguration = {
      schemaVersion: 1,
      speciesName,
      occurrence,
      predictors: predictorIds.map((datasetId, index) => ({
        datasetId,
        variableName: `predictor_${index + 1}`,
        type: 'continuous',
      })),
      studyArea: { strategy: 'predictor-intersection' },
      background: { strategy: 'random', pointCount: 10000 },
      model: {
        featureClasses: ['linear', 'quadratic', 'product', 'hinge'],
        regularizationMultiplier: 1,
      },
      validation: { method: 'train-test-split', testFraction: 0.2 },
      seed: crypto.getRandomValues(new Uint32Array(1))[0],
    };
    setBusy(true);
    try {
      const current = await responseJson<ConfigurationResponse>(
        await api.request(`/v1/analyses/${analysisId}/configuration`)
      );
      await responseJson(
        await api.request(`/v1/analyses/${analysisId}/configuration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createKey() },
          body: JSON.stringify({ expectedRevision: current.revision, configuration }),
        })
      );
      await responseJson(await api.request(`/v1/analyses/${analysisId}/queue`, { method: 'POST' }));
      setStatus('Submitted. The configuration and selected inputs are now frozen for execution.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to submit the analysis.');
    } finally {
      setBusy(false);
    }
  };

  const setFiles =
    (setter: (files: File[]) => void) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      setter(Array.from(event.target.files ?? []));
    };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_var(--muted),_transparent_44%),linear-gradient(135deg,_var(--background),_var(--surface))] px-5 py-10 text-foreground sm:px-10">
      <section className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Analysis submission
        </p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Build a reproducible suitability run.
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Each submission models one species using one occurrence dataset and selected GeoTIFF
          predictors. Inputs and configuration become immutable when queued.
        </p>
        <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-overlay">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {status}
          </p>
          {analysisId ? (
            <p className="mt-2 font-mono text-xs text-muted-foreground">Analysis {analysisId}</p>
          ) : null}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-xl font-semibold">1. Inputs</h2>
            <label className="mt-5 block text-sm font-medium">Occurrence format</label>
            <select
              className="mt-2 w-full rounded-md border border-border bg-surface p-2"
              value={format}
              onChange={(event) => setFormat(event.target.value as OccurrenceFormat)}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="geojson">GeoJSON</option>
              <option value="shapefile">Shapefile bundle</option>
            </select>
            <label className="mt-5 block text-sm font-medium">Occurrence files</label>
            <input
              className="mt-2 block w-full text-sm"
              type="file"
              multiple={format === 'shapefile'}
              onChange={setFiles(setOccurrenceFiles)}
            />
            <label className="mt-5 block text-sm font-medium">GeoTIFF predictors</label>
            <input
              className="mt-2 block w-full text-sm"
              type="file"
              multiple
              accept=".tif,.tiff,image/tiff"
              onChange={setFiles(setPredictorFiles)}
            />
            <button
              disabled={busy || !analysisId}
              onClick={uploadInputs}
              className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Upload inputs
            </button>
          </section>
          <form onSubmit={saveAndQueue} className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-xl font-semibold">2. Configuration and review</h2>
            <label className="mt-5 block text-sm font-medium">Species name</label>
            <input
              required
              maxLength={120}
              className="mt-2 w-full rounded-md border border-border bg-surface p-2"
              value={speciesName}
              onChange={(event) => setSpeciesName(event.target.value)}
            />
            {format === 'csv' || format === 'xlsx' ? (
              <>
                <label className="mt-4 block text-sm font-medium">Longitude column</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-surface p-2"
                  value={longitudeColumn}
                  onChange={(event) => setLongitudeColumn(event.target.value)}
                />
                <label className="mt-4 block text-sm font-medium">Latitude column</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-surface p-2"
                  value={latitudeColumn}
                  onChange={(event) => setLatitudeColumn(event.target.value)}
                />
              </>
            ) : null}
            {format === 'xlsx' ? (
              <>
                <label className="mt-4 block text-sm font-medium">Worksheet</label>
                <input
                  className="mt-2 w-full rounded-md border border-border bg-surface p-2"
                  value={worksheet}
                  onChange={(event) => setWorksheet(event.target.value)}
                />
              </>
            ) : null}
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Defaults: 10,000 random background points, linear/quadratic/product/hinge features,
              regularization 1, 20% holdout validation. Inputs use WGS84 where applicable.
            </p>
            <button
              disabled={busy || !analysisId || predictorIds.length === 0}
              className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              Save and queue immutable submission
            </button>
          </form>
        </div>
        <button
          disabled={busy || Boolean(analysisId)}
          onClick={createAnalysis}
          className="mt-8 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Create analysis draft
        </button>
      </section>
    </main>
  );
}
