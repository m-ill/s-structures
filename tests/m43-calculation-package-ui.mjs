import assert from 'node:assert/strict';
import {
  applyDesignBasisLoads,
  CALCULATION_PACKAGE_VERSION,
  createKdsRuleBasedLoadCombinations,
  createTwoStoryElasticFrameModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Native Calculation Package UI' };
model.loads = [];
applyDesignBasisLoads(model, { occupancy: 'office' });
model.loadCombinations = createKdsRuleBasedLoadCombinations(model, { includeService: true });

let result = null;
const target = {
  document,
  location: { search: '' },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => result?.envelope || null,
  reanalyze: () => {
    result = target.analyzeModel(model);
    return result;
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
bridge.reanalyze();

const capabilities = target.SStructuresAgent.getCapabilities();
assert.equal(capabilities.modules.calculationPackage, CALCULATION_PACKAGE_VERSION);
assert.equal(capabilities.modules.calculationPackageUi, 'm43-calculation-package-ui');
assert.ok(capabilities.executeActions.includes('openNativeCalculationPackage'));
assert.ok(capabilities.milestones.some((item) => item.id === 'M43'));

const button = document.getElementById('mCalculationPackage');
assert.ok(button, 'calculation package menu button should be injected');
assert.equal(button.getAttribute('data-agent-id'), 'mCalculationPackage');
button.click();

const reportModal = document.getElementById('reportModal');
const reportBody = document.getElementById('reportBody');
assert.equal(reportModal.classList.contains('show'), true);
assert.equal(target.SStructuresCalculationPackage.data.version, CALCULATION_PACKAGE_VERSION);
assert.match(reportBody.innerHTML, /Table of Contents/);
assert.match(reportBody.innerHTML, /Design Basis And Loads/);

const snapshot = target.SStructuresAgent.execute('openNativeCalculationPackage', {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(snapshot.calculationPackage.version, CALCULATION_PACKAGE_VERSION);
assert.equal(snapshot.calculationPackage.modalOpen, true);
assert.equal(snapshot.calculationPackage.sectionCount, 7);
assert.equal(snapshot.calculationPackage.auditOk, true);

console.log(JSON.stringify({
  ok: true,
  version: CALCULATION_PACKAGE_VERSION,
  htmlLength: snapshot.calculationPackage.htmlLength,
  sectionCount: snapshot.calculationPackage.sectionCount,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
