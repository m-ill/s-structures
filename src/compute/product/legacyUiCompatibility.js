import { analyzeModel } from './elasticAnalysisWorkflow.js';
import { runPushover } from '../../nonlinear/pushover.js';

export const LEGACY_UI_ANALYSIS_COMPATIBILITY_VERSION = 'p9-m10-legacy-ui-analysis-compatibility-v2';
export const LEGACY_UI_ANALYSIS_COMPATIBILITY_POLICY = Object.freeze({
  scope: 'legacy-snapshot-report-and-pre-phase8-pushover-only',
  status: 'retained-approved-compatibility',
  productExecutionAllowed: false,
  designTransferAllowed: false,
  gpuAllowed: false,
  reviewedAtMilestone: 'P9-M10',
  expires: null,
  reviewBy: 'Phase10',
  removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
});

export const LEGACY_UI_ANALYSIS_COMPATIBILITY_INVENTORY = Object.freeze([
  Object.freeze({
    id: 'P9-COMPAT-LEGACY-SNAPSHOT',
    symbols: Object.freeze(['analyzeLegacyUiSnapshot', 'window.analyzeModel']),
    owner: 'product-analysis-service',
    allowedCallers: Object.freeze(['src/ui/indexBridge.js', 'src/ui/indexAgentApi.js', 'src/ui/m3State.js']),
    replacement: 'startAnalysisRun/getAnalysisRunStatus/getAnalysisRunResult',
    status: 'retained-approved-compatibility',
    removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  }),
  Object.freeze({
    id: 'P9-COMPAT-LEGACY-PUSHOVER',
    symbols: Object.freeze(['runLegacyUiPushover', 'SStructuresAgent.runPushover']),
    owner: 'product-analysis-service',
    allowedCallers: Object.freeze(['src/ui/indexBridge.js', 'src/ui/indexAgentApi.js']),
    replacement: 'startAnalysisRun/getAnalysisRunStatus/getAnalysisRunResult',
    status: 'retained-approved-compatibility',
    removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  }),
]);

export function listLegacyUiAnalysisCompatibility() {
  return LEGACY_UI_ANALYSIS_COMPATIBILITY_INVENTORY.map((row) => ({
    ...row,
    symbols: [...row.symbols],
    allowedCallers: [...row.allowedCallers],
  }));
}

export function analyzeLegacyUiSnapshot(model) {
  return analyzeModel(model);
}

export function runLegacyUiPushover(model, options = {}) {
  return runPushover(model, options);
}
