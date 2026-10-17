import { redirect } from 'next/navigation';
import { analysisResponseSchema, type Analysis } from '@ecosuitability/contracts';
import { serverApi } from './server-api';

type Area = 'setup' | 'run' | 'results';

export const analysisRoute = async (
  analysisId: string,
  area: Area
): Promise<Analysis | undefined> => {
  try {
    const { analysis } = await serverApi(`/v1/analyses/${analysisId}`, analysisResponseSchema);
    if (
      ['queued', 'running', 'cancelling', 'failed', 'cancelled'].includes(analysis.status) &&
      area !== 'run'
    ) {
      redirect(`/analyses/${analysisId}/run`);
    }
    if (analysis.status === 'succeeded' && area !== 'results') {
      redirect(`/analyses/${analysisId}`);
    }
    if (['draft', 'uploading'].includes(analysis.status) && area !== 'setup') {
      redirect(`/analyses/${analysisId}/setup/data`);
    }
    return analysis;
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    return undefined;
  }
};
