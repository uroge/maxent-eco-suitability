'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analysisConfigurationResponseSchema,
  analysisConfigurationSchema,
  analysisInputManifestResponseSchema,
  analysisInputProfileResponseSchema,
  type AnalysisConfiguration,
  type AnalysisConfigurationResponse,
  type AnalysisInputManifestResponse,
  type AnalysisInputProfileResponse,
} from '@ecosuitability/contracts';
import { Alert, Button, Card } from '@ecosuitability/ui';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { SetupShell } from './SetupShell';
import { OccurrenceConfigurationFields } from './OccurrenceConfigurationFields';
import { PredictorConfigurationFields } from './PredictorConfigurationFields';
import { ModelConfigurationFields } from './ModelConfigurationFields';
import { EvaluationConfigurationFields } from './EvaluationConfigurationFields';
import {
  createDefaultConfiguration,
  type ConfigurationFormInput,
} from './configuration-form-model';

export const ConfigurationScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });
  const profile = useQuery({
    queryKey: analysisKeys.profile(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/input-profile`, analysisInputProfileResponseSchema),
  });
  const saved = useQuery({
    queryKey: analysisKeys.configuration(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/configuration`, analysisConfigurationResponseSchema),
  });

  if (inputs.isError || profile.isError || saved.isError) {
    return (
      <ConfigurationShell analysisId={analysisId}>
        <QueryStateAlert
          error={inputs.error ?? profile.error ?? saved.error}
          title="Configuration data unavailable"
          onRetry={() => {
            void inputs.refetch();
            void profile.refetch();
            void saved.refetch();
          }}
        />
      </ConfigurationShell>
    );
  }

  if (inputs.isPending || profile.isPending || saved.isPending) {
    return (
      <ConfigurationShell analysisId={analysisId}>
        <Card className="p-8 text-sm text-muted-foreground">Loading configuration data…</Card>
      </ConfigurationShell>
    );
  }

  return (
    <ConfigurationForm
      key={`${inputs.data.inputs.inputRevision}:${saved.data.revision}:${profile.data.profile.inputFingerprint}`}
      analysisId={analysisId}
      inputs={inputs.data}
      profile={profile.data}
      saved={saved.data}
    />
  );
};

const ConfigurationShell: React.FC<React.PropsWithChildren<{ analysisId: string }>> = ({
  analysisId,
  children,
}) => (
  <SetupShell
    analysisId={analysisId}
    current="configuration"
    title="Configure the model"
    description="Configuration requires the current input profile."
  >
    {children}
  </SetupShell>
);

type ConfigurationFormProps = {
  analysisId: string;
  inputs: AnalysisInputManifestResponse;
  profile: AnalysisInputProfileResponse;
  saved: AnalysisConfigurationResponse;
};

const ConfigurationForm: React.FC<ConfigurationFormProps> = ({
  analysisId,
  inputs,
  profile,
  saved,
}) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const predictors = inputs.inputs.datasets.filter((entry) => entry.dataset.kind === 'predictor');
  const occurrence = inputs.inputs.datasets.find((entry) => entry.dataset.kind === 'occurrence');
  const form = useForm<ConfigurationFormInput, unknown, AnalysisConfiguration>({
    resolver: zodResolver(analysisConfigurationSchema),
    defaultValues: createDefaultConfiguration(analysisId, inputs, profile, saved),
  });

  const submit = form.handleSubmit(async (configuration) => {
    const configurationBody = { expectedRevision: saved.revision, configuration };
    const response = await api.request(`/v1/analyses/${analysisId}/configuration`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey('configuration', analysisId, configurationBody),
      },
      body: JSON.stringify(configurationBody),
    });
    if (!response.ok) {
      form.setError('root', {
        message: 'The inputs or configuration changed. Reload and try again.',
      });
      return;
    }
    const savedConfiguration = analysisConfigurationResponseSchema.parse(await response.json());
    const preflightBody = {
      expectedInputRevision: inputs.inputs.inputRevision,
      expectedConfigurationRevision: savedConfiguration.revision,
      configurationFingerprint: savedConfiguration.fingerprint,
    };
    const preflight = await api.request(`/v1/analyses/${analysisId}/preflight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey('preflight', analysisId, preflightBody),
      },
      body: JSON.stringify(preflightBody),
    });
    if (!preflight.ok) {
      form.setError('root', { message: 'Configuration saved, but preflight could not be queued.' });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
    router.push(`/analyses/${analysisId}/setup/review`);
  });

  return (
    <SetupShell
      analysisId={analysisId}
      current="configuration"
      title="Configure the model"
      description="Resolve source mappings, select predictors, choose validation policies, and set reproducible maxnet parameters."
    >
      <form className="space-y-6" onSubmit={submit}>
        {form.formState.errors.root?.message ? (
          <Alert variant="destructive">{form.formState.errors.root.message}</Alert>
        ) : null}
        <OccurrenceConfigurationFields
          form={form}
          occurrence={occurrence}
          profile={profile.profile}
        />
        <PredictorConfigurationFields form={form} predictors={predictors} />
        <ModelConfigurationFields form={form} />
        <EvaluationConfigurationFields form={form} />
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
