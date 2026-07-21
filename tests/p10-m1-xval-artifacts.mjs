import assert from 'node:assert/strict';
import { normalizeUnitSystem } from '../src/core/unitSystem.js';
import { modelHash } from '../src/verification/matrix/record.js';
import {
  XVAL_REFERENCE_ARTIFACT_VERSION,
  XVAL_REFERENCE_CASE_IDS,
  XVAL_REFERENCE_SOURCES,
  buildXvalReferenceArtifact,
  parseXvalReferenceArtifact,
  serializeXvalReferenceArtifact,
  validateXvalReferenceArtifact,
  xvalReferenceArtifactHash,
} from '../src/verification/xval/referenceArtifact.js';

const repositoryModel = {
  schemaVersion: 5,
  id: 'XV-01-FIXTURE',
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }],
};
const boundModelHash = modelHash(repositoryModel);
assert.match(boundModelHash, /^[0-9a-f]{16}$/);

const readyInput = {
  status: 'ready',
  caseId: 'XV-01',
  source: 'hand-calc',
  sourceVersion: 'portal-hand-calc-v1',
  date: '2026-07-20',
  author: 'Phase 10 verification team',
  model: {
    modelHash: boundModelHash,
    unitSystem: normalizeUnitSystem(),
  },
  quantities: [
    {
      path: 'byCombo.D_ONLY.nodes.N2.displacement.ux',
      value: 12.5,
      unit: 'mm',
      tolerance: 1e-4,
      scale: 1e-9,
    },
    {
      path: 'byCombo.D_ONLY.memberResults[0].endForces.fx',
      value: -40,
      unit: 'kN',
      tolerance: 1e-3,
    },
  ],
  provenance: {
    inputFiles: ['docs/phase10/hand-calc/XV-01.md'],
    notes: 'Closed-form portal-frame reference.',
  },
};

const ready = buildXvalReferenceArtifact(readyInput);
assert.equal(ready.version, XVAL_REFERENCE_ARTIFACT_VERSION);
assert.equal(ready.status, 'ready');
assert.equal(ready.artifactHash, xvalReferenceArtifactHash(ready));
assert.match(ready.artifactHash, /^[0-9a-f]{24}$/);
assert.equal(validateXvalReferenceArtifact(ready).ok, true);
assert.equal(Object.isFrozen(ready), true);
assert.equal(Object.isFrozen(ready.model.unitSystem), true);

const reordered = buildXvalReferenceArtifact({
  provenance: readyInput.provenance,
  quantities: readyInput.quantities,
  model: readyInput.model,
  author: readyInput.author,
  date: readyInput.date,
  sourceVersion: readyInput.sourceVersion,
  source: readyInput.source,
  caseId: readyInput.caseId,
  status: readyInput.status,
});
assert.equal(reordered.artifactHash, ready.artifactHash, 'artifact hash must be key-order independent');

const serialized = serializeXvalReferenceArtifact(ready);
assert.equal(serialized, serializeXvalReferenceArtifact(ready));
const parsed = parseXvalReferenceArtifact(serialized);
assert.deepEqual(parsed, ready);
assert.equal(Object.isFrozen(parsed), true);

const pending = buildXvalReferenceArtifact({
  ...readyInput,
  status: 'pending-reference',
  caseId: 'XV-03',
  source: 'opensees',
  sourceVersion: '3.6.x-owner-input-pending',
  quantities: [],
  provenance: {
    inputFiles: [],
    notes: 'Model is committed; external reference values are pending.',
  },
});
assert.equal(validateXvalReferenceArtifact(pending).ok, true);
assert.equal(parseXvalReferenceArtifact(serializeXvalReferenceArtifact(pending)).status, 'pending-reference');

for (const caseId of XVAL_REFERENCE_CASE_IDS) {
  assert.equal(validateXvalReferenceArtifact(buildXvalReferenceArtifact({ ...readyInput, caseId })).ok, true);
}
for (const source of XVAL_REFERENCE_SOURCES) {
  assert.equal(validateXvalReferenceArtifact(buildXvalReferenceArtifact({ ...readyInput, source })).ok, true);
}

const tampered = structuredClone(ready);
tampered.quantities[0].value += 1;
assertIncludes(validateXvalReferenceArtifact(tampered), 'artifact:integrity-hash');
assert.throws(() => serializeXvalReferenceArtifact(tampered), hasCode('XVAL_REFERENCE_ARTIFACT_INVALID'));
assert.throws(() => parseXvalReferenceArtifact(JSON.stringify(tampered)), hasCode('XVAL_REFERENCE_ARTIFACT_INVALID'));

assertRejected('bad model hash', { ...readyInput, model: { ...readyInput.model, modelHash: `${boundModelHash}0` } }, 'artifact:model-hash');
assertRejected('bad unit policy', {
  ...readyInput,
  model: {
    ...readyInput.model,
    unitSystem: {
      ...readyInput.model.unitSystem,
      internal: { ...readyInput.model.unitSystem.internal, force: 'N' },
    },
  },
}, 'artifact:unit-system-internal:force');
assertRejected('bad display unit', {
  ...readyInput,
  model: {
    ...readyInput.model,
    unitSystem: {
      ...readyInput.model.unitSystem,
      display: { ...readyInput.model.unitSystem.display, displacement: 'inch' },
    },
  },
}, 'artifact:unit-system-display:displacement');
assertRejected('unsafe path traversal', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], path: 'byCombo..constructor.polluted' }],
}, 'artifact:quantity:0:path');
assertRejected('unsafe prototype segment', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], path: 'byCombo.__proto__.ux' }],
}, 'artifact:quantity:0:path');
assertRejected('unknown quantity unit', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], unit: 'furlong' }],
}, 'artifact:quantity:0:unit');
assertRejected('ready without quantities', { ...readyInput, quantities: [] }, 'artifact:quantities-required');
assertRejected('duplicate quantity path', {
  ...readyInput,
  quantities: [readyInput.quantities[0], { ...readyInput.quantities[0], value: 99 }],
}, 'artifact:quantity:1:duplicate-path');
assertRejected('non-scalar value', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], value: [12.5] }],
}, 'artifact:quantity:0:value');
assertRejected('nonpositive tolerance', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], tolerance: 0 }],
}, 'artifact:quantity:0:tolerance');
assertRejected('nonpositive scale', {
  ...readyInput,
  quantities: [{ ...readyInput.quantities[0], scale: 0 }],
}, 'artifact:quantity:0:scale');
assertRejected('bad source', { ...readyInput, source: 'spreadsheet' }, 'artifact:source');
assertRejected('bad case', { ...readyInput, caseId: 'XV-09' }, 'artifact:case-id');
assertRejected('bad date', { ...readyInput, date: 'today' }, 'artifact:date');
assertRejected('invalid calendar date', { ...readyInput, date: '2026-02-30' }, 'artifact:date');

const extraField = structuredClone(ready);
extraField.unreviewed = true;
extraField.artifactHash = xvalReferenceArtifactHash(extraField);
assertIncludes(validateXvalReferenceArtifact(extraField), 'artifact:schema');

const extraQuantityField = structuredClone(ready);
extraQuantityField.quantities[0].expression = 'unsafe()';
extraQuantityField.artifactHash = xvalReferenceArtifactHash(extraQuantityField);
assertIncludes(validateXvalReferenceArtifact(extraQuantityField), 'artifact:quantity:0:schema');

const wrongVersion = structuredClone(ready);
wrongVersion.version = 'p10-m1-xval-reference-artifact-v0';
wrongVersion.artifactHash = xvalReferenceArtifactHash(wrongVersion);
assertIncludes(validateXvalReferenceArtifact(wrongVersion), 'artifact:version');

assert.throws(() => parseXvalReferenceArtifact('{'), hasCode('XVAL_REFERENCE_ARTIFACT_PARSE_FAILED'));
assert.throws(() => parseXvalReferenceArtifact([]), hasCode('XVAL_REFERENCE_ARTIFACT_PARSE_FAILED'));

console.log(JSON.stringify({
  ok: true,
  version: XVAL_REFERENCE_ARTIFACT_VERSION,
  modelHash: boundModelHash,
  artifactHash: ready.artifactHash,
  readyQuantityCount: ready.quantities.length,
  pendingQuantityCount: pending.quantities.length,
}, null, 2));

function assertRejected(label, input, expectedError) {
  assert.throws(
    () => buildXvalReferenceArtifact(input),
    (error) => error?.code === 'XVAL_REFERENCE_ARTIFACT_INVALID'
      && error.errors.includes(expectedError),
    label,
  );
}

function assertIncludes(validation, expectedError) {
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes(expectedError), `${expectedError}: ${validation.errors.join(', ')}`);
}

function hasCode(code) {
  return (error) => error?.code === code;
}
