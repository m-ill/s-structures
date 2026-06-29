import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  runStabilizationHarness,
  STABILIZATION_HARNESS_VERSION,
} from '../src/index.js';

const result = runStabilizationHarness({
  generatedAt: '2026-06-29T00:00:00.000Z',
});

assert.equal(result.version, STABILIZATION_HARNESS_VERSION);
assert.equal(result.ok, true, JSON.stringify(result.summary.failedIds, null, 2));
assert.equal(result.count, 15);
assert.equal(result.failedCount, 0);
assert.equal(result.summary.categories['representative-building'], 10);
assert.equal(result.summary.categories['agent-api'], 1);
assert.equal(result.summary.categories['design-basis'], 1);
assert.equal(result.summary.inputPaths['agent-modeling-actions'], 1);
assert.equal(result.summary.inputPaths['representative-building-generator'], 10);
assert.ok(result.summary.maxNodeCount > 0);
assert.ok(result.summary.maxMemberCount > 0);
assert.ok(result.summary.maxLoadCount > 0);
assert.ok(result.summary.maxDisplacement > 0);
assert.ok(result.summary.maxUtilization > 0);

for (const item of result.cases) {
  assert.equal(item.ok, true, item.issues.join('\n'));
  assert.equal(item.summary.validation.errorCount, 0, `${item.id} validation errors`);
  assert.equal(item.summary.analysis.ok, true, `${item.id} analysis`);
  assert.ok(item.summary.analysis.comboCount >= 1, `${item.id} combos`);
  assert.ok(item.summary.visuals.nodes === item.summary.model.nodes, `${item.id} visual nodes`);
  assert.ok(item.summary.visuals.members === item.summary.model.members, `${item.id} visual members`);
  assert.ok(item.summary.visuals.maxDisplacement > 0, `${item.id} visual displacement`);
  assert.ok(item.summary.report.htmlLength > 1000, `${item.id} report`);
  assert.ok(item.summary.calculationPackage.sectionCount >= 7, `${item.id} package sections`);
  assert.ok(item.summary.calculationPackage.memberTraceRows > 0, `${item.id} member trace`);
  for (const combo of item.summary.analysis.comboResults) {
    assert.equal(combo.ok, true, `${item.id} ${combo.id}`);
    assert.ok(combo.equilibriumResidual < 1e-8, `${item.id} ${combo.id} residual`);
  }
}

const agentCase = result.cases.find((item) => item.id === 'agent-grid-frame');
assert.ok(agentCase.summary.actionHistory.length >= 4);
assert.equal(agentCase.summary.actionHistory.some((item) => item.action === 'createGridFrame'), true);
assert.equal(agentCase.summary.actionHistory.some((item) => item.action === 'applyLoadTemplate'), true);

const designBasisCase = result.cases.find((item) => item.id === 'design-basis-two-story');
assert.ok(designBasisCase.summary.calculationPackage.loadDerivationRows > 0);
assert.equal(designBasisCase.summary.calculationPackage.qualityItems.some((item) => item.name === 'Load derivation attached' && item.status === 'OK'), true);

const representativeCases = result.cases.filter((item) => item.category === 'representative-building');
assert.equal(representativeCases.length, 10);
assert.equal(new Set(representativeCases.map((item) => item.id)).size, 10);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.stabilizationHarness, STABILIZATION_HARNESS_VERSION);
assert.ok(manifest.dataContracts.includes('stabilizationHarnessReportSet'));
assert.ok(manifest.milestones.some((item) => item.id === 'M46'));

console.log(JSON.stringify({
  ok: true,
  version: STABILIZATION_HARNESS_VERSION,
  cases: result.count,
  categories: result.summary.categories,
  maxNodeCount: result.summary.maxNodeCount,
  maxMemberCount: result.summary.maxMemberCount,
}, null, 2));
