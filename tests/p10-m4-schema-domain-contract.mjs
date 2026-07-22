import assert from 'node:assert/strict';
import { createModel, ERROR_CODES, validateModel } from '../src/index.js';
import {
  DOMAIN_BINARY_VERSION,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from '../src/compute/contracts/domainBinary.js';
import { buildAnalysisDomainHashes } from '../src/core/analysisDomainHashes.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { buildElementDescriptors } from '../src/solver/domain/elementDescriptor.js';
import { evaluateNonlinearIntegrationCapabilities } from '../src/nonlinear/integration/capabilityMatrix.js';
import { executeModelingAction, INDEX_AGENT_ACTIONS_VERSION } from '../src/ui/indexAgentActions.js';

const vectorOffset = {
  i: { dx: 0.1, dy: 0.2, dz: 0.3 },
  j: { dx: -0.2, dy: -0.1, dz: 0 },
  frame: 'global',
  rigidFactor: 1,
};
const panelZone = { tp: 0.012, db: 0.55, dc: 0.6, axis: 'z' };
const model = baseModel();
model.members[0].endOffset = vectorOffset;
model.members[0].insertionPoint = 'top-center';
model.nodes[1].panelZone = panelZone;
const modelValidation = validateModel(model);
assert.equal(modelValidation.ok, true, '3D offsets, insertion point, and panel-zone input must validate');

const domain = packDomainBinary(model);
assert.equal(DOMAIN_BINARY_VERSION, 'p10-domain-binary-v5');
assert.equal(validateDomainBinary(domain).ok, true);
assert.deepEqual([...domain.buffers.memberOffsets], [0.1, 0.2, 0.3, -0.2, -0.1, 0]);
assert.deepEqual([...domain.buffers.memberOffsetFrames], [1]);
assert.deepEqual([...domain.buffers.memberOffsetKinds], [0b11]);
assert.deepEqual([...domain.buffers.memberOffsetRigidFactors], [1]);
assert.deepEqual([...domain.buffers.memberInsertionPoints], [1]);
assert.deepEqual([...domain.buffers.nodePanelZones], [0, 0, 0, 0.012, 0.55, 0.6]);
assert.deepEqual([...domain.buffers.nodePanelZoneAxis], [0, 3]);
const unpacked = unpackDomainBinary(domain);
assert.deepEqual(unpacked.members[0].endOffset, vectorOffset);
assert.equal(unpacked.members[0].insertionPoint, 'top-center');
assert.deepEqual(unpacked.nodes[1].panelZone, panelZone);

const noOffset = baseModel();
assert.notEqual(packDomainBinary(noOffset).domainHash, domain.domainHash, 'M4 fields participate in DomainBinary hash');
assert.notEqual(
  buildAnalysisDomainHashes(noOffset).constraintHash,
  buildAnalysisDomainHashes(model).constraintHash,
  'M4 kinematics and panel-zone data invalidate the constraint hash',
);

const descriptors = buildElementDescriptors(model);
assert.equal(descriptors.ok, true, descriptors.errors[0]?.message);
assert.equal(descriptors.descriptors[0].geometry.offsets.vector3d, true);
assert.equal(descriptors.descriptors[0].geometry.offsets.insertionPoint, 'top-center');
assert.equal(descriptors.descriptors[0].panelZone.rows[0].source, 'panelZone');
assert.equal(descriptors.descriptors[0].partialFixity.entries[0].source, 'panelZone');

const canonical = buildCanonicalAnalysisDomain(model);
assert.equal(canonical.ok, true, canonical.reason);
const nonlinear = evaluateNonlinearIntegrationCapabilities(canonical, { mode: 'static' });
assert.equal(nonlinear.ok, false);
assert.ok(nonlinear.blocking.some((row) => row.code === 'NONLINEAR_3D_OFFSET_UNSUPPORTED'));

for (const [label, mutate, code] of [
  ['bad frame', (copy) => { copy.members[0].endOffset.frame = 'member'; }, ERROR_CODES.BAD_MEMBER_OFFSET],
  ['bad component', (copy) => { copy.members[0].endOffset.i.dy = '0.2'; }, ERROR_CODES.BAD_MEMBER_OFFSET],
  ['partial rigid factor', (copy) => { copy.members[0].endOffset.rigidFactor = 0.5; }, ERROR_CODES.BAD_MEMBER_OFFSET],
  ['bad insertion', (copy) => { copy.members[0].insertionPoint = 'middle-magic'; }, ERROR_CODES.BAD_MEMBER_INSERTION_POINT],
  ['bad panel thickness', (copy) => { copy.nodes[1].panelZone.tp = 0; }, ERROR_CODES.BAD_PANEL_ZONE],
  ['spring conflict', (copy) => { copy.members[0].releases.spring = { rzJ: 10 }; }, ERROR_CODES.PANEL_ZONE_SPRING_CONFLICT],
  ['panel zone on truss', (copy) => { copy.members[0].type = 'truss'; }, ERROR_CODES.PANEL_ZONE_FRAME_REQUIRED],
]) {
  const copy = structuredClone(model);
  mutate(copy);
  const validation = validateModel(copy);
  assert.equal(validation.ok, false, label);
  assert.ok(validation.errors.some((row) => row.code === code), `${label} must report ${code}`);
}

const actionModel = baseModel();
const state = { selection: { type: null, id: null } };
executeModelingAction(actionModel, state, 'updateMember', {
  id: 'M1',
  endOffset: vectorOffset,
  insertionPoint: 'top-center',
});
executeModelingAction(actionModel, state, 'updateNode', { id: 'N2', panelZone });
assert.deepEqual(actionModel.members[0].endOffset, vectorOffset);
assert.equal(actionModel.members[0].insertionPoint, 'top-center');
assert.deepEqual(actionModel.nodes[1].panelZone, panelZone);
executeModelingAction(actionModel, state, 'updateMember', { id: 'M1', endOffset: null, insertionPoint: null });
executeModelingAction(actionModel, state, 'updateNode', { id: 'N2', panelZone: null });
assert.equal(actionModel.members[0].endOffset, undefined);
assert.equal(actionModel.members[0].insertionPoint, undefined);
assert.equal(actionModel.nodes[1].panelZone, undefined);
assert.equal(INDEX_AGENT_ACTIONS_VERSION, 'p10-m5-agent-modeling-actions-v4');

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m4-schema-domain-contract',
  domainVersion: DOMAIN_BINARY_VERSION,
  descriptorVersion: descriptors.version,
  nonlinearBlocker: 'NONLINEAR_3D_OFFSET_UNSUPPORTED',
}, null, 2));

function baseModel() {
  return createModel({
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 4, y: 0, z: 0 },
    ],
    members: [{
      id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
    }],
    loads: [],
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: 'D', type: 'service', factors: { D: 1 } }],
  });
}
