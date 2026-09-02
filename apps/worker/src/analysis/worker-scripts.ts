import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readScript = (filename: string): string =>
  readFileSync(join(__dirname, 'scripts', filename), 'utf8');

export const ClaimWorkerScript = readScript('claim-worker.lua');

export const UpdateWorkerScript = readScript('update-worker.lua');

export const FinishWorkerScript = readScript('finish-worker.lua');

export const ScheduleCleanupScript = readScript('schedule-cleanup.lua');
