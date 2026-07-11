import assert from 'node:assert/strict';
import {
  assignMemberHinges,
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.materials.push({
  id: 'HINGE_STEEL',
  version: 1,
  E: 205000,
  G: 79000,
  Fy: 275,
  nonlinear: {
    backbone: [
      { rotation: 0, moment: 0 },
      { rotation: 0.008, moment: 55 },
      { rotation: 0.04, moment: 66 },
    ],
    capRatio: 1.18,
    residualRatio: 0.24,
  },
});
model.members[0].matId = 'HINGE_STEEL@1';

const target = {
  document,
  location: { pathname: '/index.html', search: '', hash: '' },
  history: { replaceState() {} },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => null,
  reanalyze: () => null,
  draw: () => {},
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;

installIndexEngineBridge(target);

for (const id of [
  'ssHingePanel',
  'ssHingeEndI',
  'ssHingeEndJ',
  'ssHingeBackbone',
  'ssHingeType',
  'ssHingeAssign',
  'ssHingeClear',
]) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

const capabilities = target.SStructuresAgent.getCapabilities();
assert.ok(capabilities.executeActions.includes('assignHinge'));
assert.ok(capabilities.executeActions.includes('removeHinge'));
assert.ok(capabilities.readApis.includes('getHingeAssignments'));
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M6'));

const memberId = model.members[0].id;
target.SStructuresAgent.execute('assignHinge', {
  memberId,
  ends: ['i'],
  type: 'moment',
  backbone: 'HINGE_STEEL@1',
});

assert.deepEqual(model.members[0].nonlinear.hingeEnds, ['i']);
assert.equal(model.members[0].nonlinear.hinges[0].My, 55);
assert.equal(model.members[0].nonlinear.hinges[0].thetaY, 0.008);

let assignmentView = target.SStructuresAgent.getHingeAssignments();
assert.equal(assignmentView.summary.explicitHingeCount, 1);
assert.equal(assignmentView.summary.assignedMemberCount, 1);
assert.ok(assignmentView.assignment.summary.overrideCount >= 1);

let engineAssignment = assignMemberHinges(model);
let endI = engineAssignment.hinges.find((hinge) => hinge.memberId === memberId && hinge.end === 'i');
assert.equal(endI.type, 'moment');
assert.equal(endI.My, 55);
assert.equal(endI.thetaY, 0.008);
assert.equal(endI.backbone.points[1].moment, 55);

target.SStructuresAgent.execute('selectEntity', { type: 'member', id: memberId });
document.getElementById('ssHingeEndI').checked = false;
document.getElementById('ssHingeEndJ').checked = true;
document.getElementById('ssHingeBackbone').value = 'HINGE_STEEL@1';
document.getElementById('ssHingeType').value = 'pmm';
document.getElementById('ssHingeAssign').click();

assert.equal(model.members[0].nonlinear.hinges.length, 2);
assert.ok(model.members[0].nonlinear.hinges.some((hinge) => hinge.end === 'j' && hinge.type === 'pmm'));
assert.equal(document.getElementById('ssHingeMarkers').children.length, 2);

document.getElementById('ssHingeClear').click();
assert.deepEqual(model.members[0].nonlinear.hingeEnds, ['i']);
assert.equal(model.members[0].nonlinear.hinges.length, 1);

assignmentView = target.SStructuresAgent.getHingeAssignments();
assert.equal(assignmentView.summary.explicitHingeCount, 1);
engineAssignment = assignMemberHinges(model);
endI = engineAssignment.hinges.find((hinge) => hinge.memberId === memberId && hinge.end === 'i');
assert.ok(endI);

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  memberId,
  explicitHinges: assignmentView.summary.explicitHingeCount,
  engineHinges: engineAssignment.summary.hingeCount,
  markers: document.getElementById('ssHingeMarkers').children.length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
