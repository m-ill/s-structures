import assert from 'node:assert/strict';
import { sectionOf, toInternalSection } from '../src/core/catalogs.js';
import { KS_H_SECTIONS } from '../src/materials/db/ksH.js';
import { resolveSectionRecord } from '../src/materials/registry.js';
import {
  computeSectionProperties,
  validateSectionGeometry,
} from '../src/materials/sectionProperties.js';
import { normalizeSectionRecord, validateSectionRecord } from '../src/materials/sectionSchema.js';

const side = 0.3;
const square = computeSectionProperties('SQUARE', { B: side * 1000 });
const squareAsRect = computeSectionProperties('RECT', { B: side * 1000, H: side * 1000 });
close(square.A, side ** 2, 1e-15, 'square A');
close(square.Iy, side ** 4 / 12, 1e-15, 'square Iy');
close(square.Iz, side ** 4 / 12, 1e-15, 'square Iz');
close(square.J / side ** 4, 0.140577015, 5e-10, 'square Saint-Venant coefficient');
close(square.J, independentRectangleJ(side, side), 1e-14, 'square independent J');
for (const key of ['A', 'Iy', 'Iz', 'J']) close(square[key], squareAsRect[key], 1e-15, `SQUARE/RECT ${key}`);
assert.equal(square.provenance.formula, 'solid-rectangle-saint-venant-series');
assert.equal(square.provenance.source, 'computed-parametric');
assert.ok(square.Ay > 0 && square.Az > 0);

const rectB = 0.2;
const rectH = 0.5;
const rect = computeSectionProperties('RECT', { B: rectB * 1000, H: rectH * 1000 });
close(rect.J, independentRectangleJ(rectB, rectH), 1e-14, 'rect independent J');
const polarMoment = rectB * rectH * (rectB ** 2 + rectH ** 2) / 12;
assert.ok(Math.abs(rect.J - polarMoment) / rect.J > 0.5, 'J must not use the polar second moment');
const slender = computeSectionProperties('RECT', { B: 10, H: 1000 });
const thinRectangleLimit = 1 * 0.01 ** 3 / 3;
assert.ok(slender.J / thinRectangleLimit > 0.99 && slender.J / thinRectangleLimit < 1);

const box = computeSectionProperties('BOX', { B: 200, H: 300, t: 10 });
const b = 0.2;
const h = 0.3;
const t = 0.01;
const bi = b - 2 * t;
const hi = h - 2 * t;
close(box.A, b * h - bi * hi, 1e-15, 'box A');
close(box.Iy, (h * b ** 3 - hi * bi ** 3) / 12, 1e-15, 'box Iy');
close(box.Iz, (b * h ** 3 - bi * hi ** 3) / 12, 1e-15, 'box Iz');
close(box.J, 2 * t * (b - t) ** 2 * (h - t) ** 2 / (b + h - 2 * t), 1e-15, 'box J');
assert.equal(computeSectionProperties('BOX', { B: 100, H: 200, t: 50 }), null);
assert.deepEqual(validateSectionGeometry('BOX', { B: 100, H: 200, t: 50 }).errors, ['params.t-overlaps-box-walls']);

const pipe = computeSectionProperties('PIPE', { D: 200, t: 8 });
const d = 0.2;
const di = d - 0.016;
const pipeI = Math.PI * (d ** 4 - di ** 4) / 64;
close(pipe.A, Math.PI * (d ** 2 - di ** 2) / 4, 1e-15, 'pipe A');
close(pipe.Iy, pipeI, 1e-15, 'pipe I');
close(pipe.J, 2 * pipeI, 1e-15, 'pipe J');
assert.equal(computeSectionProperties('PIPE', { D: 100, t: 50 }), null);

assert.equal(computeSectionProperties('SQUARE', { B: 300, H: 301 }), null);
assert.equal(computeSectionProperties('H', { H: 300, B: 150, tw: 6.5, tf: 150 }), null);
const invalidBoxRecord = validateSectionRecord({
  id: 'BAD_BOX', version: 1, kind: 'parametric', shape: 'BOX', params: { B: 100, H: 200, t: 50 },
});
assert.equal(invalidBoxRecord.ok, false);
assert.ok(invalidBoxRecord.errors.includes('params.t-overlaps-box-walls'));

const provenance = { source: 'user-certified-calculation', reference: 'CALC-42' };
const general = validateSectionRecord({
  id: 'GENERAL-1',
  version: 1,
  kind: 'direct',
  shape: 'GENERAL',
  properties: {
    A: 0.02,
    Iy: 2e-4,
    Iz: 1e-4,
    J: 5e-6,
    Ay: 0.012,
    Az: 0.011,
    Cw: 4e-8,
    Iyz: -1e-6,
    principalAngle: 0.12,
    provenance,
  },
});
assert.equal(general.ok, true, general.errors.join(', '));
assert.equal(general.normalized.properties.Ay, 0.012);
assert.equal(general.normalized.properties.Az, 0.011);
assert.equal(general.normalized.properties.Cw, 4e-8);
assert.equal(general.normalized.properties.Iyz, -1e-6);
assert.deepEqual(general.normalized.propertyProvenance, provenance);

const topLevelDirect = normalizeSectionRecord({
  id: 'GENERAL-2', version: 1, kind: 'direct', shape: 'GENERAL',
  A: 0.03, Iy: 3e-4, Iz: 2e-4, J: 8e-6, Ay: 0.02, Az: 0.018, Cw: 0,
  propertyProvenance: { source: 'import', file: 'sections.csv' },
});
assert.equal(topLevelDirect.properties.Ay, 0.02);
assert.equal(topLevelDirect.properties.Cw, 0);
assert.equal(topLevelDirect.properties.provenance.file, 'sections.csv');
assert.equal(toInternalSection(topLevelDirect).Az, 0.018);

const negativeShearArea = validateSectionRecord({
  id: 'BAD-GENERAL', version: 1, kind: 'direct', shape: 'GENERAL',
  properties: { A: 0.02, Iy: 2e-4, Iz: 1e-4, Ay: -0.01 },
});
assert.equal(negativeShearArea.ok, false);
assert.ok(negativeShearArea.errors.includes('properties.Ay'));

for (const row of KS_H_SECTIONS) assert.equal(validateSectionRecord(row).ok, true, row.id);
const parametricSeed = resolveSectionRecord(null, 'H-400x200x8x13@1');
assert.equal(parametricSeed.propertyProvenance.database, 's-structures-parametric-h-seed-v1');
assert.equal(parametricSeed.source.verificationStatus, 'unverified-parametric');
assert.match(parametricSeed.source.note, /not a verified KS section table/i);
assert.equal(resolveSectionRecord(null, 'NO_SUCH_SECTION'), null);
assert.throws(
  () => sectionOf(null, 'NO_SUCH_SECTION'),
  (error) => error.code === 'invalid-section-reference' && error.reference === 'NO_SUCH_SECTION',
);

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m1-section-core',
  squareJCoefficient: square.J / side ** 4,
  strictHollowGeometry: true,
  generalOptionalProperties: ['Ay', 'Az', 'Cw'],
}, null, 2));

function independentRectangleJ(side1, side2) {
  const a = Math.max(side1, side2);
  const b = Math.min(side1, side2);
  let oddSeries = 0;
  for (let n = 1; n <= 999; n += 2) {
    oddSeries += Math.tanh(n * Math.PI * a / (2 * b)) / n ** 5;
  }
  return a * b ** 3 / 3 * (1 - 192 * b * oddSeries / (Math.PI ** 5 * a));
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
