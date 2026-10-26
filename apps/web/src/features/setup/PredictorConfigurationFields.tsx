'use client';

import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import {
  Card,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ecosuitability/ui';
import {
  variableName,
  type ConfigurationFormApi,
  type InputDataset,
} from './configuration-form-model';

type PredictorConfigurationFieldsProps = {
  form: ConfigurationFormApi;
  predictors: InputDataset[];
};

export const PredictorConfigurationFields: React.FC<PredictorConfigurationFieldsProps> = ({
  form,
  predictors,
}) => {
  const predictorFields = useFieldArray({
    control: form.control,
    name: 'predictors',
    keyName: 'fieldKey',
  });
  const terrain = useWatch({ control: form.control, name: 'visualization.terrain' });

  const togglePredictor = (datasetId: string, checked: boolean): void => {
    const index = predictorFields.fields.findIndex((field) => field.datasetId === datasetId);
    if (checked && index < 0) {
      const source = predictors.find((entry) => entry.dataset.id === datasetId);
      predictorFields.append({
        datasetId,
        variableName: variableName(
          source?.files[0]?.originalName ?? '',
          predictorFields.fields.length
        ),
        type: 'continuous',
      });
    } else if (!checked && index >= 0) {
      predictorFields.remove(index);
      if (terrain?.datasetId === datasetId) {
        form.setValue('visualization.terrain', null);
      }
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Predictors</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Select at least one attached raster, then give it a unique model-safe name and type.
      </p>
      <div className="mt-5 space-y-4">
        {predictors.map((entry) => {
          const index = predictorFields.fields.findIndex(
            (field) => field.datasetId === entry.dataset.id
          );
          const selected = index >= 0;
          return (
            <div className="rounded-lg border border-border p-4" key={entry.dataset.id}>
              <label className="flex min-h-10 items-center gap-3">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => togglePredictor(entry.dataset.id, checked === true)}
                />
                <span className="font-mono text-xs">{entry.files[0]?.originalName}</span>
              </label>
              {selected ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
                  <Input
                    aria-label={`Variable name for ${entry.files[0]?.originalName}`}
                    {...form.register(`predictors.${index}.variableName`)}
                  />
                  <Controller
                    control={form.control}
                    name={`predictors.${index}.type`}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value === 'categorical' && terrain?.datasetId === entry.dataset.id) {
                            form.setValue('visualization.terrain', null);
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continuous">Continuous</SelectItem>
                          <SelectItem value="categorical">Categorical</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <input type="hidden" {...form.register(`predictors.${index}.datasetId`)} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {form.formState.errors.predictors ? (
        <p className="mt-3 text-sm text-destructive">
          Select at least one predictor and resolve its fields.
        </p>
      ) : null}
    </Card>
  );
};
