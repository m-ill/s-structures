import { analyzeModel } from '../../solver/linear3d.js';
import { runPushover } from '../../nonlinear/pushover.js';

export const LEGACY_UI_ANALYSIS_COMPATIBILITY_VERSION = 'p9-m9-legacy-ui-analysis-compatibility-v1';
export const LEGACY_UI_ANALYSIS_COMPATIBILITY_POLICY = Object.freeze({
  scope: 'legacy-snapshot-report-and-pre-phase8-pushover-only',
  productExecutionAllowed: false,
  gpuAllowed: false,
  expires: 'P9-M10',
});

export function analyzeLegacyUiSnapshot(model) {
  return analyzeModel(model);
}

export function runLegacyUiPushover(model, options = {}) {
  return runPushover(model, options);
}
