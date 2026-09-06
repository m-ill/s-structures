import assert from 'node:assert/strict';
import {
  LEGACY_MATERIALS_CATALOG,
  MATERIALS,
  MATERIALS_CATALOG,
  SECTIONS,
  isKnownMaterialReference,
  isKnownSectionReference,
  materialOf,
  toInternalMaterial,
} from '../src/core/catalogs.js';
import { createModel } from '../src/core/modelFactory.js';
import { validateModel } from '../src/core/validation.js';
import {
  KS_STEEL_LEGACY_ALIASES,
  KS_STEEL_MATERIALS,
  findKsSteelLegacyAlias,
  findKsSteelMaterial,
  isVerifiedCurrentKsSteelMaterial,
} from '../src/materials/db/ksSteel.js';
import {
  isVerifiedCurrentMaterialRecord,
  validateMaterialRecord,
  validateStandardMaterialMetadata,
} from '../src/materials/materialSchema.js';
import { resolveMaterialRecord } from '../src/materials/registry.js';

assert.ok(KS_STEEL_MATERIALS.length >= 16);
for (const record of KS_STEEL_MATERIALS) {
  const checked = validateMaterialRecord(record);
  assert.equal(checked.ok, true, `${record.id}: ${checked.errors.join(', ')}`);
  assert.equal(validateStandardMaterialMetadata(record).length, 0);
  assert.equal(isVerifiedCurrentKsSteelMaterial(record), true);
  assert.equal(isVerifiedCurrentMaterialRecord(record), true);
  for (const key of ['standardCode', 'edition', 'designation', 'productForm', 'gradeBasis', 'thicknessRange']) {
    assert.ok(record[key], `${record.id}.${key}`);
  }
}

assert.equal(findKsSteelMaterial('SS275', 16).id, 'SS275');
assert.equal(findKsSteelMaterial('SS275', 17).id, 'SS275-T16-40');
assert.equal(findKsSteelMaterial('SS275', 17).mechanicalProperties.Fy, 265);
assert.equal(findKsSteelMaterial('SM355', { suffix: 'B', thicknessMm: 50 }).id, 'SM355B-T40-75');
assert.equal(findKsSteelMaterial('SM355B', 50).mechanicalProperties.Fy, 335);
assert.equal(findKsSteelMaterial('SM355B', 101), null);

assert.equal(KS_STEEL_LEGACY_ALIASES.length, 5);
const ss400Alias = findKsSteelLegacyAlias('ss 400');
assert.deepEqual(ss400Alias.candidateDesignations, ['SS275']);
assert.equal(ss400Alias.equivalent, false);
assert.equal(ss400Alias.automaticMigration, false);
const sm490Alias = findKsSteelLegacyAlias('SM490');
assert.deepEqual(sm490Alias.candidateDesignations, ['SM355A', 'SM355B', 'SM355C']);
assert.ok(sm490Alias.requires.includes('suffix'));
assert.equal(resolveMaterialRecord(null, 'SS400'), null, 'legacy aliases must not resolve as current materials');
const preservedSs400 = materialOf({
  materials: [{ id: 'SS400', version: 1, E: 205000, G: 79000, Fy: 235, Fu: 400, density: 7.85 }],
}, 'SS400@1');
assert.equal(preservedSs400.Fy, 235000, 'an explicit legacy project snapshot must remain exact');

assert.equal(MATERIALS_CATALOG.some((record) => record.id === 'steel' || record.id === 'sm490'), false);
assert.deepEqual(LEGACY_MATERIALS_CATALOG.map((record) => record.id), ['steel', 'sm490']);
assert.ok(LEGACY_MATERIALS_CATALOG.every((record) => record.legacy && record.status === 'legacy'));
const legacySteel = materialOf(null, 'steel@1');
const currentSteel = materialOf(null, 'SS275@1');
assert.equal(legacySteel.Fy, 235000);
assert.equal(currentSteel.Fy, 275000);
assert.notEqual(legacySteel.Fy, currentSteel.Fy);
assert.equal(legacySteel.migration.equivalent, false);

const canonical = toInternalMaterial({
  id: 'CANONICAL',
  version: 1,
  kind: 'steel',
  elastic: { E: 210000, G: 81000, rho: 7.9 },
  strength: { steel: { Fy: 355, Fu: 490 } },
  allow: { fb: 200, ft: 190, fc: 180, fv: 110 },
});
assert.equal(canonical.E, 210000000);
assert.equal(canonical.G, 81000000);
assert.equal(canonical.Fy, 355000);
assert.equal(canonical.Fu, 490000);
assert.equal(canonical.density, 7.9);
assert.equal(canonical.fb, 200000);
assert.equal(canonical.fa, 180000);
assert.equal(canonical.fs, 110000);

const projectMaterial = material('SS275', 2, 302, 'project');
const globalMaterial = material('SS275', 99, 399, 'global');
assert.equal(resolveMaterialRecord({ materials: [globalMaterial, projectMaterial] }, 'SS275').version, 2);
assert.equal(resolveMaterialRecord({ materials: [globalMaterial] }, 'SS275').version, 99);
assert.equal(resolveMaterialRecord(null, 'SS275').source.scope, 'builtin');

const deletedProject = { ...material('SCOPED', 1, 300, 'project'), deleted: true };
const activeGlobal = material('SCOPED', 1, 250, 'global');
const exactDeleted = resolveMaterialRecord({ materials: [activeGlobal, deletedProject] }, 'SCOPED@1');
assert.equal(exactDeleted.source.scope, 'project');
assert.equal(exactDeleted.deleted, true);
assert.equal(exactDeleted._softDeletedReference, true);
assert.equal(resolveMaterialRecord({ materials: [activeGlobal, deletedProject] }, 'SCOPED').source.scope, 'global');

assert.equal(resolveMaterialRecord(null, 'NO_SUCH_MATERIAL'), null);
assert.throws(
  () => materialOf(null, 'NO_SUCH_MATERIAL'),
  (error) => error.code === 'invalid-material-reference' && error.reference === 'NO_SUCH_MATERIAL',
);

assert.ok(MATERIALS.SS275);
assert.ok(SECTIONS['H-400x200x8x13']);
assert.equal(isKnownMaterialReference(null, 'SS275@1'), true);
assert.equal(isKnownSectionReference(null, 'H-400x200x8x13@1'), true);

const validationModel = createModel({
  materials: [],
  sections: [],
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 3 },
  ],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'SS275@1', secId: 'H-400x200x8x13@1' }],
});
const validation = validateModel(validationModel);
assert.equal(validation.ok, true, JSON.stringify(validation.errors));

const missingEdition = validateMaterialRecord({ ...KS_STEEL_MATERIALS[0], edition: '' });
assert.equal(missingEdition.ok, false);
assert.ok(missingEdition.errors.includes('edition'));
const steelBackbone = validateMaterialRecord({
  id: 'FY-E', version: 1, kind: 'steel', elastic: { E: 200000, G: 77000 },
  strength: { steel: { Fy: 400, Fu: 500 } },
}).normalized.nonlinear.backbone;
assert.equal(steelBackbone[1].strain, 400 / 200000);
assert.equal(steelBackbone[1].stress, 400);

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m1-material-registry',
  currentRecords: KS_STEEL_MATERIALS.length,
  aliasRecords: KS_STEEL_LEGACY_ALIASES.length,
  strictResolution: true,
}, null, 2));

function material(id, version, Fy, scope) {
  return {
    id,
    version,
    kind: 'steel',
    elastic: { E: 205000, G: 79000, rho: 7.85 },
    strength: { steel: { Fy, Fu: Fy + 100 } },
    source: { scope },
  };
}
