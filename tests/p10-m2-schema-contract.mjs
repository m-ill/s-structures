import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  computeSectionProperties,
  createModel,
  listAnalysisCriteriaKeys,
  migrateModel,
  resolveCriterion,
  resolveSectionShearAreas,
  validateModel,
} from '../src/index.js';
import { toInternalSection } from '../src/core/catalogs.js';
import {
  resolveGlobalShearDeformation,
  resolveMemberShearDeformationSetting,
} from '../src/solver/timoshenko.js';

const fresh = createModel();
assert.equal(fresh.analysisSettings.shearDeformation, true);
assert.equal(Object.hasOwn(fresh.analysisSettings, 'includeShearDeformation'), false);
assert.equal(resolveGlobalShearDeformation(fresh).enabled, true);
assert.equal(createModel({ analysisSettings: { validateBeforeSolve: false } }).analysisSettings.shearDeformation, true);
assert.equal(createModel({ analysisSettings: { includeShearDeformation: false } }).analysisSettings.shearDeformation, false);

const migratedAbsent = migrateModel({ schemaVersion: 5, nodes: [], members: [], loads: [] });
assert.equal(migratedAbsent.model.analysisSettings.shearDeformation, false);
assert.equal(resolveGlobalShearDeformation(migratedAbsent.model).enabled, false);

const migratedAlias = migrateModel({
  schemaVersion: 5,
  nodes: [], members: [], loads: [],
  analysisSettings: { includeShearDeformation: true },
});
assert.equal(migratedAlias.model.analysisSettings.shearDeformation, true);
assert.equal(resolveGlobalShearDeformation(migratedAlias.model).enabled, true);

const conflictingGlobal = resolveGlobalShearDeformation({
  analysisSettings: { shearDeformation: true, includeShearDeformation: false },
});
assert.equal(conflictingGlobal.enabled, false);
assert.equal(conflictingGlobal.valid, false);
const conflictingMember = resolveMemberShearDeformationSetting(
  { analysisSettings: { shearDeformation: true } },
  { shearDeformation: true, includeShearDeformation: false },
);
assert.equal(conflictingMember.enabled, false);
assert.equal(conflictingMember.valid, false);

const invalidGlobal = createModel();
invalidGlobal.analysisSettings.shearDeformation = 'true';
assert.ok(validateModel(invalidGlobal).errors.some((item) => item.code === ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING));

const invalidMember = createModel({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 2, y: 0, z: 0, support: null },
  ],
  members: [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    releases: { i: 'rigid', j: 'rigid' }, shearDeformation: 1,
  }],
});
assert.ok(validateModel(invalidMember).errors.some((item) => item.code === ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING));

const h = computeSectionProperties('H', { H: 300, B: 150, tw: 6.5, tf: 9 });
close(h.Ay, 0.0065 * (0.3 - 2 * 0.009), 1e-15, 'H Ay');
close(h.Az, 2 * 0.15 * 0.009, 1e-15, 'H Az');
assert.equal(h.provenance.shearAreaMethod, 'H-web-flange-geometric');

const box = computeSectionProperties('BOX', { H: 300, B: 200, t: 10 });
close(box.Ay, 0.9 * box.A, 1e-15, 'BOX Ay');
assert.equal(box.provenance.shearAreaFallback, true);

const general = toInternalSection({
  id: 'GENERAL', version: 1, kind: 'direct', shape: 'GENERAL',
  properties: { A: 0.02, Iy: 2e-4, Iz: 1e-4, J: 5e-6 },
});
close(general.Ay, 0.018, 1e-15, 'general Ay fallback');
close(general.Az, 0.018, 1e-15, 'general Az fallback');
assert.equal(general.shearAreaProvenance.fallback, true);

const explicit = resolveSectionShearAreas({ shape: 'GENERAL', A: 0.02, Ay: 0.011, Az: 0.012 });
assert.equal(explicit.Ay, 0.011);
assert.equal(explicit.Az, 0.012);
assert.equal(explicit.provenance.sourceY, 'explicit');
const explicitAliases = resolveSectionShearAreas({ shape: 'GENERAL', A: 0.02, As_y: 0.011, As_z: 0.012 });
assert.equal(explicitAliases.Ay, 0.011);
assert.equal(explicitAliases.Az, 0.012);
assert.equal(explicitAliases.provenance.methodY, 'section.As_y');

assert.equal(resolveCriterion(fresh, 'element.shearSlenderCutoff'), 60);
assert.equal(resolveCriterion(fresh, 'element.shearShallowTol'), 1e-3);
assert.equal(resolveCriterion(fresh, 'element.shearPhiZeroTol'), 1e-12);
assert.equal(resolveCriterion(fresh, 'element.shearDeepBeamTol'), 1e-9);
assert.equal(resolveCriterion(fresh, 'element.shearReleaseTol'), 1e-8);
for (const key of [
  'criteria.element.shearSlenderCutoff',
  'criteria.element.shearShallowTol',
  'criteria.element.shearPhiZeroTol',
  'criteria.element.shearDeepBeamTol',
  'criteria.element.shearReleaseTol',
]) assert.ok(listAnalysisCriteriaKeys().includes(key), key);

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m2-schema-contract',
  freshDefault: fresh.analysisSettings.shearDeformation,
  migratedDefault: migratedAbsent.model.analysisSettings.shearDeformation,
  hShearAreas: [h.Ay, h.Az],
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
