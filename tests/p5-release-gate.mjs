import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { findFeature } from '../src/platform/featureCatalog.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.loads = [];
model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
model.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
model.materials.push({
  id: 'P5_STEEL',
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
  },
});
model.members[0].matId = 'P5_STEEL@1';
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

const consoleErrors = [];
let lastResult = null;
const target = {
  document,
  location: { pathname: '/index.html', search: '', hash: '' },
  history: { replaceState() {} },
  localStorage: createMemoryStorage(),
  console: { error: (...args) => consoleErrors.push(args.join(' ')) },
  model: () => model,
  activeResult: () => lastResult?.envelope || null,
  reanalyze: () => {
    lastResult = target.analyzeModel(model);
    return lastResult;
  },
  draw: () => {},
  getComputedStyle(element) {
    return {
      display: element.style?.display || 'block',
      visibility: element.style?.visibility || 'visible',
    };
  },
};
document.defaultView = target;

const bridge = installIndexEngineBridge(target);
const agent = target.SStructuresAgent;

// S1: analysis cases, execution, result handles.
for (const input of [
  { id: 'S1_STATIC', kind: 'static', settings: { pDelta: true } },
  { id: 'S1_MODAL', kind: 'modal', settings: { modalModeCount: 3 } },
  { id: 'S1_RSA', kind: 'responseSpectrum', settings: { modalModeCount: 3, spectrum: { method: 'SRSS', directions: ['x', 'y'] } } },
  { id: 'S1_BUCKLING', kind: 'buckling', settings: { referenceAxialForces: { M1: 80 } } },
  { id: 'S1_THA', kind: 'linearTha', settings: { modalModeCount: 3, direction: 'x', dt: 0.02, accelerations: [0, 0.08, -0.05, 0] } },
]) {
  agent.execute('addAnalysisCase', input);
}
bridge.runAnalysisCases();
assert.equal(Object.keys(bridge.getAnalysisResults()).length, 5);
assert.ok(bridge.getAnalysisCaseResult('S1_MODAL').summary.modeCount > 0);
assert.ok(document.getElementById('ssResultCaseSel'));

// S2: loads, springs, KDS basis, and floor mass.
agent.execute('setSpringSupport', { nodeId: model.nodes.find((node) => !node.support)?.id, spring: { kz: 250000, kx: 1000 } });
agent.execute('addPartialLoad', { id: 'S2_PARTIAL', memberId: model.members[0].id, w: 2.5, from: 0.2, to: 0.8, dir: '-z', case: 'D' });
agent.execute('addTemperatureLoad', { id: 'S2_TEMP', memberId: model.members[0].id, dT: 12, case: 'D' });
agent.execute('applyDesignBasisLoads', { occupancy: 'office', floorArea: 100, roofArea: 80, deadIntensity: 4, liveIntensity: 2.5 });
agent.execute('generateFloorMass', { massPerFloor: 20 });
assert.ok(model.loads.some((load) => load.type === 'udl-partial'));
assert.ok(model.loads.some((load) => load.type === 'temperature'));
assert.ok(model.loads.some((load) => load.generatedBy));
assert.ok(model.nodes.some((node) => Array.isArray(node.mass)));

// S3: hinge assignment, pushover, NLTH, performance/result chart views.
agent.execute('assignHinge', {
  memberId: model.members[0].id,
  ends: ['i', 'j'],
  type: 'moment',
  backbone: 'P5_STEEL@1',
});
agent.execute('addAnalysisCase', { id: 'S3_PUSH', kind: 'pushover', settings: { steps: 3, referenceBaseShear: 50 } });
agent.execute('addAnalysisCase', { id: 'S3_NLTH', kind: 'nlth', settings: { record: 'sample-a', scale: 1, dt: 0.02, accelerations: [0, 0.05, -0.05, 0.04], mass: 1, stiffness: 80, yieldForce: 0.08 } });
target.SStructuresAnalysisCenter.run('S3_PUSH');
assert.ok(document.getElementById('ssPerfPoint'));
assert.ok(document.getElementById('ssChartCapacity'));
target.SStructuresAnalysisCenter.run('S3_NLTH');
assert.ok(document.getElementById('ssChartTimeHistory'));
assert.ok(bridge.getAnalysisCaseResult('S3_NLTH').summary.rowCount > 0);

// S4: result switching, calculation package, help/catalog/status/contract sync.
target.SStructuresAnalysisCenter.select('S1_MODAL');
assert.equal(target.SStructuresResultCaseView.kind, 'modal');
assert.ok(document.getElementById('ssChartModal'));
target.SStructuresAnalysisCenter.select('S1_RSA');
assert.ok(document.getElementById('ssChartSpectrum'));

const calculationPackage = agent.getCalculationPackage({ title: 'P5 Release Gate Package' });
assert.match(calculationPackage.html, /Analysis Case Result Details/);
assert.ok(calculationPackage.data.detailed.analysisCases.caseCount >= 7);
assert.equal(validateModel(model).ok, true);

assert.ok(findFeature('analysis-center'));
assert.ok(findFeature('analysis-case-results'));
const helpHtml = readFileSync('help.html', 'utf8');
assert.ok(helpHtml.includes('data-help-page="analysis-center"'));
assert.ok(helpHtml.includes('data-help-page="analysis-case-results"'));
const status = readFileSync('docs/user-manual/STATUS_AND_LIMITS.md', 'utf8');
assert.match(status, /Phase 5 Release Gate/);
assert.match(status, /Analysis Center/);

const capabilities = agent.getCapabilities();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M12'));
assert.ok(capabilities.dataContracts.includes('phase5ReleaseGate'));
assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));

console.log(JSON.stringify({
  ok: true,
  scenarioCount: 4,
  caseCount: calculationPackage.data.detailed.analysisCases.caseCount,
  resultCount: calculationPackage.data.detailed.analysisCases.resultCount,
  consoleErrors: consoleErrors.length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
