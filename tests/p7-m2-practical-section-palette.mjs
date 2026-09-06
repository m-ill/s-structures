import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexNativeModeler } from '../src/ui/indexNativeModeler.js';
import { INDEX_SECTION_LIBRARY_PANEL_VERSION } from '../src/ui/indexSectionLibraryPanel.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createModel({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 3 },
    { id: 'N3', x: 5, y: 0, z: 3 },
  ],
  members: [
    { id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', localAxis: { roll: 0, strongAxis: 'z' } },
  ],
});
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const palette = document.getElementById('palette');
const matSel = document.createElement('select');
matSel.id = 'matSel';
matSel.setAttribute('id', 'matSel');
palette.appendChild(matSel);
const secSel = document.createElement('select');
secSel.id = 'secSel';
secSel.setAttribute('id', 'secSel');
palette.appendChild(secSel);
const secProps = document.createElement('div');
secProps.id = 'secProps';
secProps.setAttribute('id', 'secProps');
palette.appendChild(secProps);
const applySec = document.createElement('button');
applySec.id = 'applySec';
applySec.setAttribute('id', 'applySec');
palette.appendChild(applySec);

let reanalysisCount = 0;
const target = {
  document,
  model: () => model,
  reanalyze: () => { reanalysisCount += 1; },
  draw() {},
  localStorage: { getItem: () => null, setItem() {} },
};
document.defaultView = target;
const bridge = {
  getCurrentModel: () => model,
  markAnalysisCasesStale() {},
};
const native = installIndexNativeModeler(target, { bridge });
const panelApi = target.SStructuresSectionLibraryPanel;

assert.equal(panelApi.version, INDEX_SECTION_LIBRARY_PANEL_VERSION);
assert.equal(matSel.value, 'SS275@1');
assert.equal(secSel.value, 'h300@1');
assert.ok(matSel.options.length >= 16, `material options: ${matSel.options.length}`);
assert.ok(secSel.options.length >= 30, `section options: ${secSel.options.length}`);
assert.ok(secSel.options.some((option) => option.textContent.includes('RC SQUARE 400x400')));
assert.ok(secSel.options.some((option) => option.textContent.includes('PIPE-165.2x5')));
assert.match(secProps.textContent, /A .*cm².*Iz .*cm⁴/);

panelApi.openEditor();
const panel = document.getElementById('ssSectionEditor');
assert.equal(panelApi.getState().editorOpen, true);
document.getElementById('ssSectionId').value = 'PROJECT-SQ450';
document.getElementById('ssSectionName').value = 'Project square 450';
document.getElementById('ssSectionDimB').value = '450';
const created = panelApi.createSection();
assert.equal(created.ok, true, created.errors?.join(', '));
assert.ok(model.sections.some((section) => section.id === 'PROJECT-SQ450'));
assert.equal(secSel.value, 'PROJECT-SQ450@1');

const shapeSelect = document.getElementById('ssSectionShape');
shapeSelect.value = 'GENERAL';
shapeSelect.dispatchEvent({ type: 'change', target: shapeSelect });
document.getElementById('ssSectionId').value = 'PROJECT-GENERAL';
document.getElementById('ssSectionName').value = 'Project direct properties';
document.getElementById('ssSectionDimA').value = '120';
document.getElementById('ssSectionDimIy').value = '24000';
document.getElementById('ssSectionDimIz').value = '36000';
document.getElementById('ssSectionDimJ').value = '5000';
const directCreated = panelApi.createSection();
assert.equal(directCreated.ok, true, directCreated.errors?.join(', '));
const directSection = model.sections.find((section) => section.id === 'PROJECT-GENERAL');
assert.equal(directSection.kind, 'direct');
assert.equal(directSection.properties.A, 0.012);
assert.equal(directSection.properties.Iz, 0.00036);
assert.equal(secSel.value, 'PROJECT-GENERAL@1');

native.execute('nativeSelectMember', { memberId: 'M1' });
const assigned = panelApi.applySelection();
assert.equal(assigned.ok, true, assigned.errors?.join(', '));
assert.equal(model.members[0].matId, 'SS275@1');
assert.equal(model.members[0].secId, 'PROJECT-GENERAL@1');

native.execute('nativeDrawMember', { id: 'M2', n1: 'N2', n2: 'N3' });
const newMember = model.members.find((member) => member.id === 'M2');
assert.equal(newMember.matId, 'SS275@1');
assert.equal(newMember.secId, 'PROJECT-GENERAL@1');
assert.ok(reanalysisCount >= 3);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_SECTION_LIBRARY_PANEL_VERSION,
  materialOptions: matSel.options.length,
  sectionOptions: secSel.options.length,
  createdSection: secSel.value,
  assignedMember: model.members[0].id,
}, null, 2));
