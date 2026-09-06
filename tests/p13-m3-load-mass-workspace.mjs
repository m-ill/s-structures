import assert from 'node:assert/strict';
import {
  applyPhase13ManualCombinationChangeSet,
  applyPhase13SlabPanelChangeSet,
  buildPhase13LoadWorkspace,
  buildPhase13LoadResultantAudit,
  buildPhase13MassParityAudit,
  parsePhase13LoadPaste,
  previewPhase13ManualCombinationChangeSet,
  previewPhase13SlabPanelChangeSet,
} from '../src/loads/phase13LoadWorkspace.js';

const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 },
  { id: 'N3', x: 4, y: 3, z: 0 }, { id: 'N4', x: 0, y: 3, z: 0 },
];
const members = [
  { id: 'M1', n1: 'N1', n2: 'N2' }, { id: 'M2', n1: 'N2', n2: 'N3' },
  { id: 'M3', n1: 'N3', n2: 'N4' }, { id: 'M4', n1: 'N4', n2: 'N1' },
];
const model = {
  nodes, members, loads: [], loadCases: [{ id: 'D', type: 'dead' }, { id: 'L', type: 'live' }],
  loadCombinations: [{ id: 'MANUAL-KEEP', type: 'linear', factors: { D: 1 }, origin: 'manual', userModified: true }],
  slabPanels: [{ id: 'P1', nodeIds: ['N1', 'N2', 'N3', 'N4'], load: 5, case: 'D', distribution: 'two-way' }],
  massSources: [{ id: 'MS1', origin: 'manual', entries: [{ case: 'D', factor: 1 }], includeNodeMass: true }],
};

const preview = previewPhase13SlabPanelChangeSet(model);
assert.equal(preview.status, 'ready');
assert.equal(preview.generated.trace.summary.totalPanelLoad, 60);
assert.equal(preview.generated.trace.summary.totalTransferredLoad, 60);
assert.deepEqual(preview.equilibrium.map((row) => row.status), ['PASS']);
const applied = applyPhase13SlabPanelChangeSet(model, preview);
assert.equal(applied.ok, true);
assert.ok(applied.model.loads.length > 0);
const reapply = previewPhase13SlabPanelChangeSet(applied.model);
assert.equal(reapply.duplicateKeys.length, 0);
assert.equal(reapply.changes.length, 0);

const overridden = { ...applied.model, loads: applied.model.loads.map((row, index) => index ? row : { ...row, userModified: true, w1: 999, origin: 'manual' }) };
const preserved = previewPhase13SlabPanelChangeSet(overridden);
assert.equal(preserved.conflicts.length, 1);
assert.equal(preserved.status, 'review-required');

const combos = previewPhase13ManualCombinationChangeSet(model, [
  { id: 'MANUAL-KEEP', type: 'linear', factors: { D: 1, L: 1 }, group: 'service' },
  { id: 'MANUAL-NEW', type: 'linear', factors: { D: 1.2, L: 1.6 }, group: 'strength' },
]);
assert.equal(combos.status, 'ready');
const comboApplied = applyPhase13ManualCombinationChangeSet(model, combos);
assert.equal(comboApplied.ok, true);
assert.ok(comboApplied.model.loadCombinations.every((row) => row.origin === 'manual' && row.userModified === true));
assert.equal(previewPhase13ManualCombinationChangeSet(model, [{ id: 'BAD', factors: { X: 1 } }]).status, 'blocked');

const workspace = buildPhase13LoadWorkspace(applied.model);
assert.equal(workspace.tabs.length, 6);
assert.equal(workspace.combinations[0].ownership, 'manual');
assert.equal(workspace.massSources[0].validation.ok, true);
const resultantFixture = {
  nodes: [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 4, y: 0, z: 0 }],
  members: [{ id: 'AB', n1: 'A', n2: 'B' }],
  loads: [{ id: 'P', type: 'nodal', node: 'B', P: 10, dir: '-z', case: 'D' }],
};
const resultant = buildPhase13LoadResultantAudit(resultantFixture, { equilibrium: { totalLoadResultant: [0, 0, -10, 0, 40, 0] } });
assert.equal(resultant.status, 'PASS');
const massPreview = buildPhase13MassParityAudit(applied.model);
const massParity = buildPhase13MassParityAudit(applied.model, { mass: { totalMass: massPreview.trace.totalMass } });
assert.equal(massParity.status, 'PASS');
const paste = parsePhase13LoadPaste('L1\t10\nL2\t=2+2', ['id', 'value']);
assert.equal(paste.ok, false);
assert.equal(paste.formulasExecuted, false);
assert.equal(paste.macrosExecuted, false);

console.log(JSON.stringify({ ok: true, milestone: 'P13-M3', generatedLoads: preview.generated.loads.length, loadResultantParity: true, massParity: true }, null, 2));
