import assert from 'node:assert/strict';
import { createPracticeModel } from '../src/core/modelFactory.js';
import { stableHash, stableStringify } from '../src/core/stableHash.js';
import { validateModel } from '../src/core/validation.js';
import { validateSourceRecord } from '../src/core/sourceRegistry.js';

assert.equal(stableStringify({ b: undefined, a: 1 }), '{"a":1}');
assert.equal(stableStringify([undefined, Number.NaN, Infinity]), '[null,null,null]');
assert.equal(stableStringify(new Array(2)), '[null,null]');
assert.equal(stableHash({ b: 2, a: 1 }), stableHash({ a: 1, b: 2 }));
const circular = {};
circular.self = circular;
assert.throws(() => stableHash(circular), /circular/i);
assert.equal(validateSourceRecord(null).ok, false);

const valid = createPracticeModel({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'B', x: 0, y: 0, z: 3, support: null },
  ],
  members: [{
    id: 'M1', n1: 'A', n2: 'B', type: 'frame', matId: 'SS275@1', secId: 'H-300x150x6.5x9@1',
    releases: { i: 'rigid', j: 'rigid' },
  }],
});
assert.equal(validateModel(valid).ok, true);

const badSpring = structuredClone(valid);
badSpring.nodes[0] = { ...badSpring.nodes[0], support: 'spring', spring: { kx: 1000, ky: Number.NaN } };
assert.ok(hasError(badSpring, 'BAD_CUSTOM_SUPPORT'));

const badSettlement = structuredClone(valid);
badSettlement.nodes[0].settlement = { ux: 0.01, uy: 'not-a-number' };
assert.ok(hasError(badSettlement, 'BAD_CUSTOM_SUPPORT'));

const badRigidFactor = structuredClone(valid);
badRigidFactor.members[0].endOffset = { i: 0.1, j: 0.1, rigidFactor: 0.5 };
assert.ok(hasError(badRigidFactor, 'BAD_MEMBER_OFFSET'));
const stringRigidFactor = structuredClone(valid);
stringRigidFactor.members[0].endOffset = { i: 0.1, j: 0.1, rigidFactor: '1' };
assert.ok(hasError(stringRigidFactor, 'BAD_MEMBER_OFFSET'));

const badMaterial = structuredClone(valid);
badMaterial.materials = [{
  id: 'BAD', version: 1, kind: 'custom',
  elastic: { E: '205000', G: 79000 }, source: { note: 'fixture' },
}];
badMaterial.members[0].matId = 'BAD@1';
assert.ok(hasError(badMaterial, 'BAD_MATERIAL_PROPS'));

const badSection = structuredClone(valid);
badSection.sections = [{
  id: 'BAD', version: 1, kind: 'direct', shape: 'GENERAL',
  properties: { A: '0.01', Iy: 1e-4, Iz: 1e-4, J: 1e-6 },
}];
badSection.members[0].secId = 'BAD@1';
assert.ok(hasError(badSection, 'BAD_SECTION_PROPS'));

console.log(JSON.stringify({
  ok: true,
  stableJsonSemantics: true,
  strictSupportValidation: true,
  strictLibraryValidation: true,
}, null, 2));

function hasError(model, code) {
  return validateModel(model).errors.some((item) => item.code === code);
}
