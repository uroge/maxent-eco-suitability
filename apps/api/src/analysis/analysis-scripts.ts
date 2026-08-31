import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readScript = (filename: string): string =>
  readFileSync(join(__dirname, 'scripts', filename), 'utf8');

export const CreateAnalysisScript = readScript('create.lua');

export const TransitionAnalysisScript = readScript('transition.lua');

export const ExpireAnalysisScript = readScript('expire.lua');
