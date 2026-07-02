import assert from 'node:assert/strict';
import {
  MATERIAL_REGISTRY_VERSION,
  SECTION_PROPERTIES_VERSION,
  buildLibraryAudit,
  computeSectionProperties,
  createModel,
  materialOf,
  sectionOf,
  validateModel,
} from '../src/index.js';

const h = computeSectionProperties('H', { H: 300, B: 150, tw: 6.5, tf: 9 });
assert.equal(SECTION_PROPERTIES_VERSION, 'p3-m10-section-properties');
assert.ok(h.A > 0 && h.Iy > 0 && h.Iz > 0 && h.ry > 0);

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
assert.equal(buildLibraryAudit(model).version, MATERIAL_REGISTRY_VERSION);

console.log(JSON.stringify({ ok: true, version: 'p3-m10-materials' }, null, 2));
