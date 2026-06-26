import assert from 'node:assert/strict';
import {
  REPRESENTATIVE_BUILDINGS_VERSION,
  REPRESENTATIVE_BUILDING_SPECS,
  analyzeModel,
  buildAgentManifest,
  createAllRepresentativeBuildingModels,
  createHtmlReport,
  summarizeRepresentativeBuilding,
} from '../src/index.js';

const items = createAllRepresentativeBuildingModels();
assert.equal(items.length, 10);
assert.deepEqual(items.map((item) => item.spec.id), REPRESENTATIVE_BUILDING_SPECS.map((spec) => spec.id));

const ids = new Set();
const rows = [];
for (const { spec, model } of items) {
  ids.add(spec.id);
  const analysis = analyzeModel(model);
  const summary = summarizeRepresentativeBuilding(spec, model, analysis);
  assert.equal(summary.version, REPRESENTATIVE_BUILDINGS_VERSION);
  assert.equal(analysis.ok, true, JSON.stringify(summary.analysis.errors, null, 2));
  assert.equal(summary.analysis.errors.length, 0);
  assert.equal(summary.analysis.comboIds.length, 3);
  assert.equal(summary.analysis.designStatus, 'OK');
  assert.ok(summary.model.nodeCount > 0);
  assert.ok(summary.model.memberCount > 0);
  assert.ok(summary.model.loadCount > 0);
  assert.ok(summary.analysis.maxEnvelopeDisplacement > 0);
  assert.ok(summary.analysis.maxEnvelopeUtilization > 0);
  assert.ok(summary.analysis.maxEnvelopeUtilization < 1);

  for (const [comboId, combo] of Object.entries(summary.analysis.combos)) {
    assert.equal(combo.ok, true, `${spec.id} ${comboId}`);
    assert.ok(combo.equilibriumResidual < 1e-8, `${spec.id} ${comboId} residual ${combo.equilibriumResidual}`);
    assert.ok(combo.maxDisplacement >= 0, `${spec.id} ${comboId} displacement`);
    assert.ok(Number.isFinite(combo.maxUtilization), `${spec.id} ${comboId} utilization`);
  }

  const report = createHtmlReport(model, analysis, { title: spec.name });
  assert.ok(report.html.includes(spec.name));
  assert.equal(report.data.model.nodeCount, model.nodes.length);
  assert.equal(report.data.analysis.ok, true);

  rows.push({
    id: spec.id,
    nodes: model.nodes.length,
    members: model.members.length,
    loads: model.loads.length,
    maxDisplacement: summary.analysis.maxEnvelopeDisplacement,
    maxUtilization: summary.analysis.maxEnvelopeUtilization,
  });
}

const manifest = buildAgentManifest();
assert.equal(manifest.modules.representativeBuildingSet, REPRESENTATIVE_BUILDINGS_VERSION);
assert.ok(manifest.dataContracts.includes('representativeBuildingReportSet'));
assert.ok(manifest.milestones.some((item) => item.id === 'M33'));
assert.equal(ids.size, 10);

console.log(JSON.stringify({
  ok: true,
  version: REPRESENTATIVE_BUILDINGS_VERSION,
  buildings: rows.length,
  maxNodeCount: Math.max(...rows.map((row) => row.nodes)),
  maxMemberCount: Math.max(...rows.map((row) => row.members)),
  ids: rows.map((row) => row.id),
}, null, 2));
