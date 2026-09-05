import assert from 'node:assert/strict';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createLoadWorkspaceModel();
const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const target = {
  document,
  model: () => model,
  reanalyze: () => {},
  draw: () => {},
  location: { search: '' },
  localStorage: createMemoryStorage(),
  getComputedStyle(element) {
    return { display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' };
  },
};
document.defaultView = target;
installIndexEngineBridge(target);
let staleEvents = 0;
const originalMarkStale = target.SStructuresEngine.markAnalysisCasesStale;
target.SStructuresEngine.markAnalysisCasesStale = (...args) => { staleEvents += 1; return originalMarkStale(...args); };

const workspace = target.SStructuresPhase13Workspace;
workspace.open();
workspace.setWorkspace('loads');

assert.equal(document.querySelectorAll('[data-p13-load-tab]').length, 6);
assert.equal(workspace.getState().loadWorkspace.tab, 'load-cases');

workspace.setLoadTab('slab-panels');
assert.ok(document.querySelector('[data-testid="p13-slab-preview"]'));
workspace.previewSlabPanelLoads();
let state = workspace.getState();
assert.equal(state.loadWorkspace.preview.kind, 'slab-panels');
assert.equal(state.loadWorkspace.preview.status, 'ready');
assert.ok(state.loadWorkspace.preview.changes > 0);
document.querySelector('[data-testid="p13-load-apply"]').click();
assert.equal(staleEvents, 1);
state = workspace.getState();
assert.equal(state.loadWorkspace.preview, null);
assert.ok(model.loads.length > 0);
assert.equal(model.analysisCases.find((row) => row.id === 'EL-STATIC').status, 'stale');

workspace.setLoadTab('manual-combinations');
workspace.previewManualCombinations('MAN-1,Manual service,service,D=1,L=1');
state = workspace.getState();
assert.equal(state.loadWorkspace.preview.kind, 'manual-combinations');
assert.equal(state.loadWorkspace.preview.status, 'ready');
workspace.applyLoadPreview();
assert.equal(staleEvents, 2);
const generated = model.loadCombinations.find((row) => row.id === 'GEN-ULS');
assert.deepEqual(generated, {
  id: 'GEN-ULS', name: 'Generated ULS', type: 'strength', factors: { D: 1.2, L: 1.6 }, origin: 'kds-generator',
});
assert.equal(model.loadCombinations.find((row) => row.id === 'MAN-1')?.origin, 'manual');
assert.equal(model.loadCombinations.find((row) => row.id === 'MAN-1')?.userModified, true);
assert.equal(workspace.getState().loadWorkspace.canUndo, true);
workspace.undoLoadChange();
assert.equal(staleEvents, 3);
assert.equal(model.loadCombinations.some((row) => row.id === 'MAN-1'), false);
assert.equal(model.loadCombinations.find((row) => row.id === 'MAN-OLD')?.origin, 'manual');
assert.deepEqual(model.loadCombinations.find((row) => row.id === 'GEN-ULS'), generated);
assert.equal(workspace.getState().loadWorkspace.canUndo, false);

workspace.setLoadTab('loads');
workspace.reviewLoadPaste('L1,nodal,N2,10,-z,D\nL2,nodal,N2,=2+2,-z,D');
state = workspace.getState();
assert.deepEqual(state.loadWorkspace.pasteReview, {
  ok: false,
  rows: 2,
  errors: 1,
  formulasExecuted: false,
  macrosExecuted: false,
});

workspace.setLoadTab('audit');
assert.ok(document.querySelector('[data-testid="p13-load-tab-audit"]')?.classList.contains('active'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P13-M3',
  tabs: 6,
  slabLoadsApplied: model.loads.length,
  generatedCombinationPreserved: true,
  lastChangeUndo: true,
  unsafePasteBlocked: true,
  oneStaleEventPerTransaction: true,
}, null, 2));

function createLoadWorkspaceModel() {
  return {
    meta: { id: 'P13-M3-UI', name: 'P13 M3 UI fixture' },
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 4, y: 0, z: 0 },
      { id: 'N3', x: 4, y: 3, z: 0 },
      { id: 'N4', x: 0, y: 3, z: 0 },
    ],
    members: [
      { id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300' },
      { id: 'M2', type: 'frame', n1: 'N2', n2: 'N3', matId: 'steel', secId: 'h300' },
      { id: 'M3', type: 'frame', n1: 'N3', n2: 'N4', matId: 'steel', secId: 'h300' },
      { id: 'M4', type: 'frame', n1: 'N4', n2: 'N1', matId: 'steel', secId: 'h300' },
    ],
    loads: [],
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }, { id: 'L', name: 'Live', type: 'live' }],
    loadCombinations: [
      { id: 'GEN-ULS', name: 'Generated ULS', type: 'strength', factors: { D: 1.2, L: 1.6 }, origin: 'kds-generator' },
      { id: 'MAN-OLD', name: 'Old manual', type: 'linear', factors: { D: 1 }, origin: 'manual', userModified: true },
    ],
    slabPanels: [{ id: 'P1', nodeIds: ['N1', 'N2', 'N3', 'N4'], load: 5, case: 'D', distribution: 'two-way' }],
    massSources: [{ id: 'MS1', origin: 'manual', entries: [{ case: 'D', factor: 1 }], includeNodeMass: true }],
    analysisCases: [{ id: 'EL-STATIC', name: 'Elastic static', kind: 'static', status: 'ok', settings: { comboId: 'GEN-ULS' } }],
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
