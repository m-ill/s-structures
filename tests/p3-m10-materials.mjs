import assert from 'node:assert/strict';
import {
  MATERIAL_REGISTRY_VERSION,
  MATERIAL_LIBRARY_REPORT_VERSION,
  MATERIAL_SCHEMA_VERSION,
  SECTION_SCHEMA_VERSION,
  SECTION_PROPERTIES_VERSION,
  buildLibraryAudit,
  buildMaterialLibraryReport,
  computeSectionProperties,
  createModel,
  materialOf,
  resolveSectionRecord,
  sectionOf,
  validateMaterialRecord,
  validateModel,
  validateSectionRecord,
} from '../src/index.js';

const h = computeSectionProperties('H', { H: 300, B: 150, tw: 6.5, tf: 9 });
assert.equal(SECTION_PROPERTIES_VERSION, 'p3-m10-section-properties');
assert.ok(h.A > 0 && h.Iy > 0 && h.Iz > 0 && h.ry > 0);
assert.equal(MATERIAL_SCHEMA_VERSION, 'p3-m10-material-schema-v1');
assert.equal(SECTION_SCHEMA_VERSION, 'p3-m10-section-schema-v1');
assert.equal(validateMaterialRecord({
  id: 'SS275', version: 2, kind: 'steel',
  elastic: { E: 205000, G: 79000 },
  strength: { steel: { Fy: 275, Fu: 410 } },
}).ok, true);
assert.equal(validateSectionRecord({
  id: 'H-CUSTOM', version: 1, kind: 'parametric',
  shape: 'H', params: { H: 300, B: 150, tw: 6.5, tf: 9 },
}).ok, true);

const model = createModel({
  materials: [
    { id: 'USER_STEEL', version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400, density: 7.8 },
    { id: 'USER_STEEL', version: 2, E: 210000, G: 80000, Fy: 300, Fu: 450, density: 7.8 },
  ],
  sections: [{ id: 'USER_H', version: 1, shape: 'H', params: { H: 300, B: 150, tw: 6.5, tf: 9 } }],
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 0, y: 0, z: 3 }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'USER_STEEL@2', secId: 'USER_H@1' }],
});

assert.equal(validateModel(model).ok, true);
assert.equal(materialOf(model, 'USER_STEEL@2').Fy, 300000);
assert.ok(sectionOf(model, 'USER_H@1').A > 0);
const audit = buildLibraryAudit(model);
assert.equal(audit.version, MATERIAL_REGISTRY_VERSION);
assert.deepEqual(audit.materialErrors, []);
assert.deepEqual(audit.sectionErrors, []);
const libraryReport = buildMaterialLibraryReport(model);
assert.equal(libraryReport.version, MATERIAL_LIBRARY_REPORT_VERSION);
assert.ok(libraryReport.materials.some((row) => row.label === 'USER_STEEL@2'));

const override = createModel({
  materials: [{ id: 'steel', version: 1, E: 190000, G: 73000, Fy: 222, Fu: 333, density: 7.7 }],
  sections: [{ id: 'h300', version: 1, A: 0.0123, Iy: 1e-4, Iz: 2e-4, J: 5e-5, Zz: 1e-3, Zy: 8e-4 }],
});
assert.equal(materialOf(override, 'steel@1').Fy, 222000);
assert.equal(sectionOf(override, 'h300@1').A, 0.0123);
assert.equal(resolveSectionRecord(null, 'H-400x200x8x13@1').source.db, 'KS-H-2024');

console.log(JSON.stringify({ ok: true, version: 'p3-m10-materials' }, null, 2));
