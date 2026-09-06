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

assert.equal(document.getElementById('enginePushoverPanel'), null, 'legacy experimental pushover panel should not be required');

agent.execute('addAnalysisCase', {
  id: 'AC_PUSH',
  kind: 'pushover',
  settings: {
    direction: '+x',
    pattern: 'triangular',
    steps: 3,
    maxLoadFactor: 1,
    referenceBaseShear: 40,
  },
});
target.SStructuresAnalysisCenter.select('AC_PUSH');

for (const id of [
  'ssPoDirection',
  'ssPoPattern',
  'ssPoSteps',
  'ssPoTarget',
  'ssPoControlNode',
  'ssPoMaxLoadFactor',
  'ssPoReferenceBaseShear',
  'ssPoControl',
]) {
  assert.ok(document.getElementById(id), `${id} should exist`);
}

document.getElementById('ssPoDirection').value = '+y';
document.getElementById('ssPoPattern').value = 'uniform';
document.getElementById('ssPoSteps').value = '4';
document.getElementById('ssPoTarget').value = '';
document.getElementById('ssPoControlNode').value = '';
document.getElementById('ssPoMaxLoadFactor').value = '1.2';
document.getElementById('ssPoReferenceBaseShear').value = '75';
const controlOptions = document.getElementById('ssPoControl').children;
assert.equal(controlOptions.find((item) => item.value === 'displacement').disabled, true);
assert.equal(controlOptions.find((item) => item.value === 'arcLength').disabled, true);
document.getElementById('ssPoControl').value = 'displacement';

target.SStructuresAnalysisCenter.save('AC_PUSH');
bridge.runAnalysisCase({ caseId: 'AC_PUSH' });
target.SStructuresAnalysisCenter.refresh();
const blocked = bridge.getAnalysisLatestAttempt('AC_PUSH');
assert.equal(blocked.status, 'unsupported');
assert.equal(blocked.designBlockReason, 'NONLINEAR_CAPABILITY_UNSUPPORTED');
assert.equal(blocked.routing.fallbackUsed, false);

document.getElementById('ssPoControl').value = 'load-factor';
target.SStructuresAnalysisCenter.save('AC_PUSH');
bridge.runAnalysisCase({ caseId: 'AC_PUSH' });
target.SStructuresAnalysisCenter.refresh();

const result = bridge.getAnalysisCaseResult('AC_PUSH');
assert.equal(result.kind, 'pushover');
assert.equal(result.status, 'preliminary');
assert.equal(result.qualification, 'legacy-preliminary');
assert.equal(result.engine.id, 'legacy-preliminary-stepwise-secant');
assert.equal(result.designBlocked, true);
assert.equal(result.settings.direction, '+y');
assert.equal(result.settings.pattern, 'uniform');
assert.equal(result.settings.steps, 4);
assert.equal(result.settings.maxLoadFactor, 1.2);
assert.equal(result.settings.referenceBaseShear, 75);
assert.equal(result.settings.control, 'load-factor');
assert.equal(result.view, 'pushover-results');
assert.equal(result.payload.curve.length, 5);
assert.equal(result.summary.stepCount, 5);
assert.ok(result.summary.maxBaseShear > 0);

assert.ok(document.getElementById('ssPoCurve'), 'capacity curve container should exist');
assert.match(document.getElementById('ssPoCurve').innerHTML, /polyline/);
assert.ok(document.getElementById('ssPoStepSlider'), 'step slider should exist');
assert.equal(document.getElementById('ssPoStepSlider').max, '4');
assert.ok(document.getElementById('ssPoStepStatus').textContent.includes('Step 4'));
assert.ok(document.getElementById('ssPoHingeStates').children.length > 0);

document.getElementById('ssPoStepSlider').value = '1';
document.getElementById('ssPoStepSlider').dispatchEvent({ type: 'input' });
assert.ok(document.getElementById('ssPoStepStatus').textContent.includes('Step 1'));

const capabilities = agent.getCapabilities();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M7'));
assert.ok(capabilities.dataContracts.includes('phase5PushoverCaseView'));

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  caseId: result.caseId,
  steps: result.summary.stepCount,
  maxBaseShear: result.summary.maxBaseShear,
  sliderMax: document.getElementById('ssPoStepSlider').max,
  hingeRows: document.getElementById('ssPoHingeStates').children.length,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
