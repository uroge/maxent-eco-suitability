'use client';

import { Controller, useWatch } from 'react-hook-form';
import { Card, Checkbox, FormField, Input, RadioGroup, RadioGroupItem } from '@ecosuitability/ui';
import type { ConfigurationFormApi } from './configuration-form-model';

export const ModelConfigurationFields: React.FC<{ form: ConfigurationFormApi }> = ({ form }) => {
  const coveragePolicy = useWatch({
    control: form.control,
    name: 'inputValidation.coveragePolicy',
  });
  const featureClasses = useWatch({ control: form.control, name: 'model.featureClasses' }) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">Input policies</h2>
        <p className="text-sm text-muted-foreground">
          Study area: predictor intersection. Exact duplicate coordinates are always removed.
        </p>
        <Controller
          control={form.control}
          name="inputValidation.coordinatePolicy"
          render={({ field }) => (
            <FormField htmlFor="coordinate-policy" label="Invalid coordinates">
              <RadioGroup
                id="coordinate-policy"
                value={field.value}
                onValueChange={field.onChange}
                className="space-y-3"
              >
                <label className="flex min-h-10 items-center gap-3">
                  <RadioGroupItem value="reject-all" />
                  Reject the dataset
                </label>
                <label className="flex min-h-10 items-center gap-3">
                  <RadioGroupItem value="exclude-invalid" />
                  Exclude invalid records
                </label>
              </RadioGroup>
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="inputValidation.coveragePolicy"
          render={({ field }) => (
            <FormField htmlFor="coverage-policy" label="Missing predictor coverage">
              <RadioGroup
                id="coverage-policy"
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (value === 'require-all') {
                    form.setValue('inputValidation.minimumCoveragePercent', 100, {
                      shouldValidate: true,
                    });
                  }
                }}
                className="space-y-3"
              >
                <label className="flex min-h-10 items-center gap-3">
                  <RadioGroupItem value="require-all" />
                  Require all records
                </label>
                <label className="flex min-h-10 items-center gap-3">
                  <RadioGroupItem value="exclude-uncovered" />
                  Exclude uncovered records
                </label>
              </RadioGroup>
            </FormField>
          )}
        />
        <FormField htmlFor="coverage" label="Minimum coverage percent">
          <Input
            id="coverage"
            type="number"
            min={80}
            max={100}
            disabled={coveragePolicy === 'require-all'}
            {...form.register('inputValidation.minimumCoveragePercent', { valueAsNumber: true })}
          />
        </FormField>
      </Card>
      <Card className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">Sampling and model</h2>
        <p className="text-sm text-muted-foreground">
          Background strategy: random sampling inside the predictor intersection.
        </p>
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
        <FormField htmlFor="feature-classes" label="Feature classes">
          <div id="feature-classes" className="grid grid-cols-2 gap-2">
            {(['linear', 'quadratic', 'product', 'hinge', 'threshold'] as const).map((feature) => {
              const selected = featureClasses.includes(feature);
              return (
                <label className="flex min-h-10 items-center gap-3 capitalize" key={feature}>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => {
                      const current = form.getValues('model.featureClasses') ?? [];
                      form.setValue(
                        'model.featureClasses',
                        checked
                          ? [...new Set([...current, feature])]
                          : current.filter((item) => item !== feature),
                        { shouldValidate: true }
                      );
                    }}
                  />
                  {feature}
                </label>
              );
            })}
          </div>
        </FormField>
      </Card>
    </div>
  );
};
