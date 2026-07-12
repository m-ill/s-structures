import assert from 'node:assert/strict';
import {
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
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

const bridge = installIndexEngineBridge(target);
const agent = target.SStructuresAgent;

agent.execute('addAnalysisCase', {
  id: 'AC_PUSH_PERF',
  kind: 'pushover',
  settings: { direction: '+x', pattern: 'triangular', steps: 4, referenceBaseShear: 70, maxLoadFactor: 1.1 },
});
target.SStructuresAnalysisCenter.select('AC_PUSH_PERF');
target.SStructuresAnalysisCenter.run('AC_PUSH_PERF');

const perfResult = bridge.getAnalysisCaseResult('AC_PUSH_PERF');
assert.equal(perfResult.kind, 'pushover');
assert.ok(document.getElementById('ssPerfPoint'), 'performance point panel should exist');
assert.ok(document.getElementById('ssPerfLevel'), 'performance level badge should exist');
assert.ok(['IO', 'LS', 'CP'].includes(document.getElementById('ssPerfLevel').textContent));
assert.ok(document.getElementById('ssPerfHingeTable'), 'hinge performance table should exist');
assert.ok(document.getElementById('ssPerfHingeTable').children.length > 1);
assert.ok(document.getElementById('ssPerfPoint').__SStructuresPerformanceReview.usageRatio >= 0);
const performanceLevel = document.getElementById('ssPerfLevel').textContent;

agent.execute('addAnalysisCase', {
  id: 'AC_NLTH_M8',
  kind: 'nlth',
  settings: { record: 'sample-a', scale: 1, dt: 0.02, damping: 0.02, mass: 1, stiffness: 100, yieldForce: 0.08 },
});
target.SStructuresAnalysisCenter.select('AC_NLTH_M8');

for (const id of ['ssNlthRecord', 'ssNlthScale', 'ssNlthDamping', 'ssNlthDt']) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

document.getElementById('ssNlthRecord').value = 'sample-b';
document.getElementById('ssNlthScale').value = '1.5';
document.getElementById('ssNlthDamping').value = '0.04';
document.getElementById('ssNlthDt').value = '0.01';
document.getElementById('ssNlthMass').value = '1.2';
document.getElementById('ssNlthStiffness').value = '130';
document.getElementById('ssNlthYieldForce').value = '0.05';
target.SStructuresAnalysisCenter.run('AC_NLTH_M8');

const nlthResult = bridge.getAnalysisCaseResult('AC_NLTH_M8');
assert.equal(nlthResult.kind, 'nlth');
assert.equal(nlthResult.status, 'preliminary');
assert.equal(nlthResult.qualification, 'legacy-preliminary');
assert.equal(nlthResult.engine.id, 'legacy-sdof-bilinear-newmark');
assert.equal(nlthResult.modelBound, false);
assert.equal(nlthResult.designBlocked, true);
assert.equal(nlthResult.settings.record, 'sample-b');
assert.equal(nlthResult.settings.scale, 1.5);
assert.equal(nlthResult.settings.dt, 0.01);
assert.equal(nlthResult.settings.damping, 0.04);
assert.equal(nlthResult.settings.mass, 1.2);
assert.equal(nlthResult.settings.stiffness, 130);
assert.equal(nlthResult.payload.rows.length, 7);
assert.equal(nlthResult.payload.inputReview.status, 'available');
assert.ok(document.getElementById('ssNlthTimeHistory'), 'NLTH time-history chart should exist');
assert.match(document.getElementById('ssNlthTimeHistory').innerHTML, /polyline/);
assert.ok(document.querySelector('.ss-nlth-caption').textContent.includes('sample-b'));
assert.match(document.getElementById('ssNlthLimitation').textContent, /Preliminary/);

const capabilities = agent.getCapabilities();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M8'));
assert.ok(capabilities.dataContracts.includes('phase5PerformanceReviewView'));
assert.ok(capabilities.dataContracts.includes('phase5NlthCaseView'));

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  performanceLevel,
  nlthRows: nlthResult.payload.rows.length,
  nlthMaxDisplacement: nlthResult.summary.maxDisplacement,
  nlthScale: nlthResult.settings.scale,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
