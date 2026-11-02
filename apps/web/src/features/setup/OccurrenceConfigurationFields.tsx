'use client';

import { Controller, useWatch } from 'react-hook-form';
import type { AnalysisInputProfile } from '@ecosuitability/contracts';
import {
  Card,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ecosuitability/ui';
import {
  noSelection,
  sourceFallback,
  type ConfigurationFormApi,
  type InputDataset,
} from './configuration-form-model';

type OccurrenceConfigurationFieldsProps = {
  form: ConfigurationFormApi;
  occurrence?: InputDataset;
  profile: AnalysisInputProfile;
};

export const OccurrenceConfigurationFields: React.FC<OccurrenceConfigurationFieldsProps> = ({
  form,
  occurrence,
  profile,
}) => {
  const worksheet = useWatch({ control: form.control, name: 'occurrence.worksheet' });
  const layer = useWatch({ control: form.control, name: 'occurrence.layer' });
  const sources = profile.occurrence.sources.length
    ? profile.occurrence.sources
    : [sourceFallback(profile)];
  const selectedSource = sources.find((item) => item.source === (worksheet || layer)) ?? sources[0];

  return (
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
      {occurrence?.dataset.format === 'xlsx' ? (
        <Controller
          control={form.control}
          name="occurrence.worksheet"
          render={({ field }) => (
            <FormField htmlFor="worksheet" label="Worksheet">
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="worksheet">
                  <SelectValue placeholder="Select worksheet" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((source) =>
                    source.source ? (
                      <SelectItem key={source.source} value={source.source}>
                        {source.source}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
      ) : null}
      {occurrence?.dataset.format === 'gpkg' ? (
        <Controller
          control={form.control}
          name="occurrence.layer"
          render={({ field }) => (
            <FormField htmlFor="gpkg-layer" label="GeoPackage point layer">
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger id="gpkg-layer">
                  <SelectValue placeholder="Select layer" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((source) =>
                    source.source ? (
                      <SelectItem key={source.source} value={source.source}>
                        {source.source}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
      ) : null}
      {occurrence?.dataset.format === 'csv' || occurrence?.dataset.format === 'xlsx' ? (
        <>
          <Controller
            control={form.control}
            name="occurrence.longitudeColumn"
            render={({ field }) => (
              <FormField htmlFor="longitude-column" label="Longitude column">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="longitude-column">
                    <SelectValue placeholder="Select longitude" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSource?.columns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="occurrence.latitudeColumn"
            render={({ field }) => (
              <FormField htmlFor="latitude-column" label="Latitude column">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="latitude-column">
                    <SelectValue placeholder="Select latitude" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSource?.columns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="occurrence.speciesColumn"
            render={({ field }) => (
              <FormField
                htmlFor="species-column"
                label="Species column"
                description="Optional; use when the file contains multiple taxa."
              >
                <Select
                  value={field.value ?? noSelection}
                  onValueChange={(value) =>
                    field.onChange(value === noSelection ? undefined : value)
                  }
                >
                  <SelectTrigger id="species-column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={noSelection}>Not specified</SelectItem>
                    {selectedSource?.columns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
        </>
      ) : null}
    </Card>
  );
};
