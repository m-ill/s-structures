import { runNewmarkNlth } from '../dynamics/newmark.js';

export const LEGACY_SDOF_NEWMARK_ADAPTER_VERSION = 'p8-m0-legacy-sdof-newmark-adapter-v1';

export function runLegacySdofNewmarkTrace(settings = {}) {
  return runNewmarkNlth(settings);
}
