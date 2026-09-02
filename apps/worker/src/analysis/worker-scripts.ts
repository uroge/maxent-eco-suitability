import { join } from 'node:path';
import { loadLuaScript } from '@ecosuitability/runtime-utils';

const readScript = (filename: string): string =>
  loadLuaScript(join(__dirname, 'scripts'), filename);

export const ClaimWorkerScript = readScript('claim-worker.lua');

export const UpdateWorkerScript = readScript('update-worker.lua');

export const FinishWorkerScript = readScript('finish-worker.lua');

export const ScheduleCleanupScript = readScript('schedule-cleanup.lua');

export const ProvisionResultScript = readScript('provision-result.lua');

export const CompleteResultScript = readScript('complete-result.lua');

export const PublishResultScript = readScript('publish-result.lua');

export const CleanupProvisionalScript = readScript('cleanup-provisional.lua');
