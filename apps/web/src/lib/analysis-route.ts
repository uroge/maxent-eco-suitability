import { redirect } from 'next/navigation';
import {
  analysisConfigurationResponseSchema,
  analysisInputProfileResponseSchema,
  analysisResponseSchema,
  type Analysis,
} from '@ecosuitability/contracts';
import { ApiClientError } from './api-error';
import { serverApi } from './server-api';

type SetupStep = 'data' | 'validation' | 'configuration' | 'review';

type RouteTarget = { area: 'setup'; step: SetupStep } | { area: 'run' } | { area: 'results' };

const setupSteps: SetupStep[] = ['data', 'validation', 'configuration', 'review'];

const optionalServerApi = async <T>(request: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
};

const setupRoute = (analysisId: string, step: SetupStep): string =>
  `/analyses/${analysisId}/setup/${step}`;

export const analysisRoute = async (
  analysisId: string,
  target: RouteTarget
): Promise<Analysis | undefined> => {
  const response = await optionalServerApi(() =>
    serverApi(`/v1/analyses/${analysisId}`, analysisResponseSchema)
  );
  if (!response || response.analysis.status === 'expired') {
    return undefined;
  }
  const analysis = response.analysis;
  if (['queued', 'running', 'cancelling', 'failed', 'cancelled'].includes(analysis.status)) {
    if (target.area !== 'run') {
      redirect(`/analyses/${analysisId}/run`);
    }
    return analysis;
  }
  if (analysis.status === 'succeeded') {
    if (target.area !== 'results') {
      redirect(`/analyses/${analysisId}`);
    }
    return analysis;
  }
  if (['draft', 'uploading'].includes(analysis.status)) {
    if (target.area !== 'setup' || target.step !== 'data') {
      redirect(setupRoute(analysisId, 'data'));
    }
    return analysis;
  }

  const profile = await optionalServerApi(() =>
    serverApi(`/v1/analyses/${analysisId}/input-profile`, analysisInputProfileResponseSchema)
  );
  let furthest: SetupStep = 'validation';
  if (profile && ['passed', 'blocked'].includes(profile.profile.status)) {
    furthest = 'configuration';
    const configuration = await serverApi(
      `/v1/analyses/${analysisId}/configuration`,
      analysisConfigurationResponseSchema
    );
    if (configuration.configuration) {
      furthest = 'review';
    }
  }
  if (target.area !== 'setup') {
    redirect(setupRoute(analysisId, furthest));
  }
  if (setupSteps.indexOf(target.step) > setupSteps.indexOf(furthest)) {
    redirect(setupRoute(analysisId, furthest));
  }
  return analysis;
};
