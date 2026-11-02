'use client';

import { Controller, useWatch } from 'react-hook-form';
import {
  Alert,
  Card,
  FormField,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ecosuitability/ui';
import { noSelection, type ConfigurationFormApi } from './configuration-form-model';

export const EvaluationConfigurationFields: React.FC<{ form: ConfigurationFormApi }> = ({
  form,
}) => {
  const method = useWatch({ control: form.control, name: 'validation.method' });
  const terrain = useWatch({ control: form.control, name: 'visualization.terrain' });
  const predictors = useWatch({ control: form.control, name: 'predictors' }) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">Evaluation</h2>
        <Controller
          control={form.control}
          name="validation.method"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-3">
              <label className="flex min-h-10 items-center gap-3">
                <RadioGroupItem value="train-test-split" />
                Train/test split
              </label>
              <label className="flex min-h-10 items-center gap-3">
                <RadioGroupItem value="k-fold" />
                K-fold evaluation
              </label>
            </RadioGroup>
          )}
        />
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
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">Optional 3D terrain</h2>
        <p className="text-sm text-muted-foreground">
          Presentation-only. Select a continuous predictor only when it is elevation measured in
          metres.
        </p>
        <Controller
          control={form.control}
          name="visualization.terrain"
          render={({ field }) => (
            <FormField htmlFor="terrain-source" label="Elevation source">
              <Select
                value={field.value?.datasetId ?? noSelection}
                onValueChange={(value) =>
                  field.onChange(
                    value === noSelection
                      ? null
                      : { datasetId: value, semanticType: 'elevation', unit: 'metres' }
                  )
                }
              >
                <SelectTrigger id="terrain-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noSelection}>Terrain disabled</SelectItem>
                  {predictors
                    .filter((predictor) => predictor.type === 'continuous')
                    .map((predictor) => (
                      <SelectItem key={predictor.datasetId} value={predictor.datasetId}>
                        {predictor.variableName || predictor.datasetId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
        {terrain ? (
          <Alert variant="warning">
            You confirm this predictor is elevation in metres. Authoritative DEM checks still
            determine availability.
          </Alert>
        ) : null}
      </Card>
    </div>
  );
};
