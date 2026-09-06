import assert from 'node:assert/strict';
import {
  ANALYSIS_AUDIT_VERSION,
  VALIDATION_HEALTH_VERSION,
  analyzeModel,
  buildAnalysisAudit,
  createPortalFrameSample,
  validateModel,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createPortalFrameSample();
const validation = validateModel(model);
assert.equal(validation.healthVersion, VALIDATION_HEALTH_VERSION);
assert.equal(validation.modelHealthScore <= 100, true);
assert.equal(validation.status, validation.warnings.length ? 'WARN' : 'OK');

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.audit.version, ANALYSIS_AUDIT_VERSION);
assert.equal(analysis.audit.ok, true);
assert.equal(analysis.audit.comboCount, analysis.combos.length);
assert.equal(analysis.audit.solvedComboCount > 0, true);
assert.equal(analysis.audit.maxEquilibriumResidual < 1e-8, true);

const audit = buildAnalysisAudit({ ok: true, byCombo: {
  BAD: { ok: true, anyOk: true, summary: { equilibriumResidual: 0.01, solverResidualNorm: 0 } },
} });
assert.equal(audit.ok, false);
assert.equal(audit.warnings[0].code, 'EQUILIBRIUM_RESIDUAL');

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getResults().audit.version, ANALYSIS_AUDIT_VERSION);
assert.equal(agent.getCapabilities().modules.analysisAudit, ANALYSIS_AUDIT_VERSION);
assert.equal(agent.getCapabilities().modules.validationHealth, VALIDATION_HEALTH_VERSION);

console.log(JSON.stringify({
  ok: true,
  validationHealth: VALIDATION_HEALTH_VERSION,
  analysisAudit: ANALYSIS_AUDIT_VERSION,
  residual: analysis.audit.maxEquilibriumResidual,
}, null, 2));
