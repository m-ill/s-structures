import assert from 'node:assert/strict';
import { installIndexNativeModeler } from '../src/ui/indexNativeModeler.js';
import { PHASE7_LIBRARY_WORKFLOW_VERSION } from '../src/ui/phase7LibraryWorkflow.js';

const model = {
  materials: [],
  sections: [],
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0 },
    { id: 'N2', x: 0, y: 0, z: 3 },
    { id: 'N3', x: 4, y: 0, z: 3 },
  ],
  members: [
    { id: 'M1', n1: 'N1', n2: 'N2', matId: 'SS275@1', secId: 'H-300x150x6.5x9@1' },
    { id: 'M2', n1: 'N2', n2: 'N3', matId: 'SS275@1', secId: 'H-300x150x6.5x9@1' },
  ],
  loads: [],
  stories: [],
};
let reanalysisCount = 0;
const bridge = {
  getCurrentModel: () => model,
  markAnalysisCasesStale() {},
};
const target = {
  model: () => model,
  reanalyze: () => { reanalysisCount += 1; },
};
const native = installIndexNativeModeler(target, { bridge });

const materialList = native.executeCommand('listLibrary', { kind: 'materials', query: 'SS275' });
assert.equal(materialList.version, PHASE7_LIBRARY_WORKFLOW_VERSION);
assert.ok(materialList.items.some((item) => item.ref === 'SS275@1' && item.usageCount === 2));

const materialPreview = native.executeCommand('previewLibraryDefinition', {
  libraryKind: 'material',
  record: {
    id: 'USER-STEEL',
    kind: 'custom',
    elastic: { E: 205000, G: 79000, rho: 7.85 },
    source: { note: 'Project laboratory values' },
  },
});
assert.equal(materialPreview.ok, true, materialPreview.errors.join(', '));
assert.equal(materialPreview.record.elastic.E, 205000);
const materialCreated = native.executeCommand('createLibraryDefinition', {
  libraryKind: 'material',
  record: materialPreview.record,
});
assert.equal(materialCreated.ok, true, materialCreated.errors?.join(', '));
assert.ok(model.materials.some((item) => item.id === 'USER-STEEL'));

const sectionPreview = native.executeCommand('previewLibraryDefinition', {
  libraryKind: 'section',
  record: { id: 'SQ300', kind: 'parametric', shape: 'SQUARE', params: { B: 300 } },
});
assert.equal(sectionPreview.ok, true, sectionPreview.errors.join(', '));
assert.equal(sectionPreview.properties.A, 0.09);
assert.ok(sectionPreview.properties.J > 0);
const sectionCreated = native.executeCommand('createLibraryDefinition', {
  libraryKind: 'section',
  record: sectionPreview.record,
});
assert.equal(sectionCreated.ok, true, sectionCreated.errors?.join(', '));

const cloned = native.executeCommand('cloneLibraryDefinition', {
  kind: 'material',
  ref: 'SS275@1',
  newId: 'SS275-PROJECT-SNAPSHOT',
});
assert.equal(cloned.ok, true, cloned.errors?.join(', '));
assert.equal(model.materials.find((item) => item.id === 'SS275-PROJECT-SNAPSHOT').source.clonedFrom, 'SS275@1');

const beforeInvalidAssignment = model.members.map((member) => member.secId);
const invalidAssignment = native.executeCommand('assignLibraryToMembers', {
  memberIds: ['M1', 'MISSING'],
  sectionRef: 'SQ300@1',
});
assert.equal(invalidAssignment.ok, false);
assert.deepEqual(model.members.map((member) => member.secId), beforeInvalidAssignment, 'failed bulk assignment must be atomic');

const assigned = native.executeCommand('assignLibraryToMembers', {
  memberIds: ['M1', 'M2'],
  materialRef: 'USER-STEEL',
  sectionRef: 'SQ300',
});
assert.equal(assigned.ok, true, assigned.errors?.join(', '));
assert.ok(model.members.every((member) => member.matId === 'USER-STEEL@1' && member.secId === 'SQ300@1'));
assert.ok(assigned.warnings.some((warning) => warning.includes('unversioned-material-reference')));

const invalidImport = native.executeCommand('previewLibraryImport', {
  bundle: {
    version: 'p7-m2-library-bundle-v1',
    materials: [{ id: 'IMPORT-MAT', kind: 'custom', elastic: { E: 200000, G: 77000 }, source: { note: 'Import' } }],
    sections: [{ id: 'IMPORT-BAD', kind: 'direct', shape: 'GENERAL', properties: { A: 0, Iy: 1, Iz: 1 } }],
  },
});
assert.equal(invalidImport.ok, false);
const rejectedImport = native.executeCommand('importLibrary', { preview: invalidImport });
assert.equal(rejectedImport.ok, false);
assert.equal(model.materials.some((item) => item.id === 'IMPORT-MAT'), false, 'invalid import must not partially apply');

const validImport = native.executeCommand('previewLibraryImport', {
  materials: [{ id: 'IMPORT-MAT', kind: 'custom', elastic: { E: 200000, G: 77000 }, source: { note: 'Import' } }],
  sections: [],
});
assert.equal(validImport.ok, true, validImport.errors.join(', '));
assert.ok(validImport.warnings.includes('missing-bundle-version'));
assert.ok(validImport.warnings.some((warning) => warning.startsWith('missing-version-migrated')));
const imported = native.executeCommand('importLibrary', { preview: validImport });
assert.equal(imported.ok, true, imported.errors?.join(', '));
assert.ok(model.materials.some((item) => item.id === 'IMPORT-MAT'));
const undone = native.undo();
assert.equal(undone.ok, true);
assert.equal(model.materials.some((item) => item.id === 'IMPORT-MAT'), false);

const exported = native.executeCommand('exportLibrary', { generatedAt: '2026-07-10T00:00:00.000Z' });
assert.ok(exported.json.includes('USER-STEEL'));
assert.ok(exported.csv.includes('SQ300'));

const validSection = model.members[0].secId;
model.members[0].secId = 'NO-SUCH-SECTION';
const strictValidation = native.executeCommand('validateLibraryReferences', { memberIds: ['M1'] });
assert.equal(strictValidation.ok, false);
assert.equal(strictValidation.errors[0].code, 'INVALID_SECTION_REFERENCE');
model.members[0].secId = validSection;

console.log(JSON.stringify({
  ok: true,
  version: PHASE7_LIBRARY_WORKFLOW_VERSION,
  projectMaterials: model.materials.length,
  projectSections: model.sections.length,
  reanalysisCount,
  undoDepth: native.getState().phase7.undoDepth,
}, null, 2));
