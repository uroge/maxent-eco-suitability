import { join } from 'node:path';
import { loadLuaScript } from '@ecosuitability/runtime-utils';

const readScript = (filename: string): string =>
  loadLuaScript(join(__dirname, 'scripts'), filename);

export const CreateAnalysisScript = readScript('create.lua');

export const TransitionAnalysisScript = readScript('transition.lua');

export const ExpireAnalysisScript = readScript('expire.lua');

export const CreateDatasetScript = readScript('create-dataset.lua');

export const RegisterFileScript = readScript('register-file.lua');

export const CompleteFileScript = readScript('complete-file.lua');

export const CompleteDatasetScript = readScript('complete-dataset.lua');

export const AbortDatasetScript = readScript('abort-dataset.lua');

export const AttachDatasetScript = readScript('attach-dataset.lua');

export const MarkReadyScript = readScript('mark-ready.lua');

export const ScheduleCleanupScript = readScript('schedule-cleanup.lua');

export const ClaimCleanupScript = readScript('claim-cleanup.lua');

export const QueueAnalysisScript = readScript('queue.lua');

export const ClaimOutboxScript = readScript('claim-outbox.lua');

export const DispatchOutboxScript = readScript('dispatch-outbox.lua');

export const UpdateConfigurationScript = readScript('update-configuration.lua');
