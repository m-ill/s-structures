import assert from 'node:assert/strict';
import {
  EQUIVALENT_SHELL_SCOPE_VERSION,
  EQUIVALENT_SHELL_WARNING,
  analyzeModel,
  buildAgentManifest,
  buildDetailedReportData,
  buildShellV1Trace,
  buildWallSlabEquivalentTrace,
  createCalculationPackageHtml,
  createModel,
  estimateSimplySupportedPlateDeflection,
  expandShellsToFrameLinks,
  runShellPatchTest,
  scanEquivalentShellForbiddenFields,
  sanitizeEquivalentShellResult,
  validateEquivalentShellGlobal,
} from '../src/index.js';
import { buildIndexResultViewModel, renderIndexResultsMarkup } from '../src/ui/indexResultsPanel.js';

const model = createShellScopeModel();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));

const trace = buildWallSlabEquivalentTrace(model, analysis);
assert.equal(trace.phase6ScopeVersion, EQUIVALENT_SHELL_SCOPE_VERSION);
assert.equal(trace.equivalentShellScope.active, true);
assert.equal(trace.equivalentShellScope.warning, EQUIVALENT_SHELL_WARNING);
assert.ok(trace.warnings.includes(EQUIVALENT_SHELL_WARNING));
assert.ok(trace.badges.some((badge) => badge.active && badge.label.includes('Equivalent')));
assert.ok(trace.contract.phase6Scope.forbiddenResults.includes('slab-local-bending-stress'));
assert.equal(trace.wallMidPier.forces[0].warnings[0], EQUIVALENT_SHELL_WARNING);
assert.equal(trace.shell.assembly.equivalentShellScope.active, true);
assert.equal(trace.shell.forbiddenFieldGuard.status, 'clean');
assert.deepEqual(scanEquivalentShellForbiddenFields(trace), []);

const rawPatch = runShellPatchTest();
assert.ok(rawPatch.stress.sx > 0);
const rawPlate = estimateSimplySupportedPlateDeflection();
assert.ok(rawPlate.wMax > 0);
const shellTrace = buildShellV1Trace(model);
assert.equal(shellTrace.forbiddenFieldGuard.status, 'forbidden-fields-removed');
assert.ok(shellTrace.forbiddenFieldGuard.removedFields.includes('benchmarks.patch.stress'));
assert.ok(shellTrace.forbiddenFieldGuard.removedFields.includes('benchmarks.plate.wMax'));
assert.deepEqual(scanEquivalentShellForbiddenFields(shellTrace), []);

const explicitSanitized = sanitizeEquivalentShellResult({
  localStress: { sx: 1 },
  nested: { plateDeflection: 0.01, safe: 2 },
});
assert.deepEqual(explicitSanitized.result, { nested: { safe: 2 } });
assert.deepEqual(explicitSanitized.removedFields, ['localStress', 'nested.plateDeflection']);

const validation = validateEquivalentShellGlobal(
  { globalDrift: 0.02, storyShear: 100, baseMoment: 300 },
  { globalDrift: 0.021, storyShear: 104, baseMoment: 327 },
  model,
);
assert.equal(validation.ok, true);
assert.equal(validation.summary.checkedCount, 3);
assert.equal(validation.rows.find((row) => row.metric === 'storyShear').tolerance, 0.05);

const failedValidation = validateEquivalentShellGlobal(
  { globalDrift: 0.02, storyShear: 100, baseMoment: 300 },
  { globalDrift: 0.04, storyShear: 130, baseMoment: 500 },
  model,
);
assert.equal(failedValidation.ok, false);
assert.equal(failedValidation.summary.failCount, 3);

const assembly = expandShellsToFrameLinks(model);
assert.equal(assembly.equivalentShellScope.active, true);
assert.equal(assembly.rows[0].warnings[0], EQUIVALENT_SHELL_WARNING);

const detailed = buildDetailedReportData(model, analysis, { generatedAt: '2026-07-10T00:00:00.000Z' });
assert.equal(detailed.equivalentShellTrace.equivalentShellScope.active, true);
assert.deepEqual(scanEquivalentShellForbiddenFields(detailed.equivalentShellTrace), []);

const pkg = createCalculationPackageHtml(model, analysis, {
  title: 'P6-M6 Equivalent Shell Scope',
  generatedAt: '2026-07-10T00:00:00.000Z',
});
assert.match(pkg.html, /equivalent-shell-scope/);
assert.match(pkg.html, /not shell FEM/);

const resultView = buildIndexResultViewModel(model, analysis);
assert.equal(resultView.summary.equivalentShellBadge.active, true);
const resultMarkup = renderIndexResultsMarkup(resultView);
assert.match(resultMarkup, /equivalent-shell-scope-badge/);
assert.match(resultMarkup, /not shell FEM/);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase6EquivalentShellScope, EQUIVALENT_SHELL_SCOPE_VERSION);
assert.ok(manifest.dataContracts.includes('phase6EquivalentShellScope'));
assert.ok(manifest.milestones.some((item) => item.id === 'P6-M6' && item.status === 'available'));

console.log(JSON.stringify({
  ok: true,
  version: EQUIVALENT_SHELL_SCOPE_VERSION,
  forbiddenRemoved: shellTrace.forbiddenFieldGuard.removedFieldCount,
  validationMaxError: validation.summary.maxRelativeError,
  warning: trace.equivalentShellScope.warning,
}, null, 2));

function createShellScopeModel() {
  const base = createModel({
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
      { id: 'C', x: 0, y: 3, z: 0, support: 'fixed' },
      { id: 'D', x: 4, y: 3, z: 0 },
      { id: 'W1-b', x: 8, y: 0, z: 0, support: 'fixed' },
      { id: 'W1-t', x: 8, y: 0, z: 3 },
    ],
    members: [
      { id: 'M1', n1: 'A', n2: 'D', matId: 'steel', secId: 'h300' },
      { id: 'W1-pier', n1: 'W1-b', n2: 'W1-t', matId: 'concrete', secId: 'W1-sec' },
    ],
    sections: [
      { id: 'W1-sec', version: 1, type: 'RECT', A: 0.8, Iy: 0.0027, Iz: 1.0667, J: 0.22, Zy: 0.53, Zz: 0.027 },
    ],
    shells: [{ id: 'S1', nodeIds: ['A', 'B', 'D', 'C'], thickness: 0.18, matId: 'concrete' }],
    loads: [
      { id: 'PX1', type: 'nodal', node: 'D', P: 20, dir: '+x', case: 'D' },
      { id: 'PX2', type: 'nodal', node: 'W1-t', P: 50, dir: '+x', case: 'D' },
    ],
  });
  base.wallEquivalents = [{
    wallId: 'W1',
    memberId: 'W1-pier',
    sectionId: 'W1-sec',
    sourceGeometry: { thickness: 0.2, length: 4, height: 3, center: { x: 8, y: 0 }, zRange: [0, 3] },
    section: base.sections.find((section) => section.id === 'W1-sec'),
  }];
  return base;
}
