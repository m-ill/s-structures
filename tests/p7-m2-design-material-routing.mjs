import assert from 'node:assert/strict';
import { createPracticeModel } from '../src/core/modelFactory.js';
import { runConcreteDesign } from '../src/design/concrete.js';
import { runSteelDesign } from '../src/design/steel.js';
import { computeSectionProperties } from '../src/materials/sectionProperties.js';

const square = section('STEEL-SQUARE', 'SQUARE', { B: 200 });
const rectangle = section('STEEL-RECT', 'RECT', { B: 200, H: 300 });
const model = createPracticeModel({
  sections: [...createPracticeModel().sections, square, rectangle],
  members: [
    member('SQUARE-COLUMN', square.id),
    member('RECT-COLUMN', rectangle.id),
  ],
});
const memberResults = Object.fromEntries(model.members.map((item) => [item.id, demand(item.id)]));
const analysis = { envelope: { combo: { id: 'TEST' }, memberResults } };

const steel = runSteelDesign(model, analysis);
const concrete = runConcreteDesign(model, analysis);

assert.equal(steel.summary.checkedMembers, 2);
assert.equal(steel.summary.skippedMembers, 0);
assert.equal(concrete.summary.checkedMembers, 0);
assert.equal(concrete.summary.skippedMembers, 2);
assert.deepEqual(Object.keys(steel.memberResults).sort(), ['RECT-COLUMN', 'SQUARE-COLUMN']);

console.log(JSON.stringify({
  ok: true,
  currentMaterial: 'SS275',
  steelChecked: steel.summary.checkedMembers,
  concreteChecked: concrete.summary.checkedMembers,
  sectionTypes: model.sections.slice(-2).map((item) => item.type),
}, null, 2));

function section(id, type, dims) {
  const properties = computeSectionProperties(type, dims);
  assert.ok(properties, `section properties must be available for ${type}`);
  return {
    id,
    version: 1,
    name: id,
    type,
    dims,
    properties,
    ...properties,
    source: { scope: 'project', note: 'Phase 7 routing fixture' },
  };
}

function member(id, secId) {
  return {
    id,
    type: 'frame',
    n1: `${id}-I`,
    n2: `${id}-J`,
    matId: 'SS275',
    secId,
  };
}

function demand(memberId) {
  return {
    memberId,
    L: 3,
    ax: { x: [0, 0, 1] },
    Nmax: 1,
    Vymax: 0,
    Vzmax: 0,
    Mymax: 0,
    Mzmax: 0,
    dmaxM: 0,
    governing: { utilization: { comboId: 'TEST', x: 0 } },
  };
}
