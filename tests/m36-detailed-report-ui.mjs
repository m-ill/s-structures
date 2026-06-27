import assert from 'node:assert/strict';
import {
  createKdsLoadCombinations,
  createTwoStoryElasticFrameModel,
  DETAILED_REPORT_VERSION,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
model.meta = { name: 'Native Detailed Report UI' };
model.loadCombinations = createKdsLoadCombinations(model);

let result = null;
const target = {
  document,
  location: { search: '' },
  localStorage: createMemoryStorage(),
  model: () => model,
  activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
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
assert.equal(capabilities.modules.detailedDesignReport, DETAILED_REPORT_VERSION);
assert.equal(capabilities.modules.kdsLoadCombinationPresets, 'm35-kds-load-combination-presets');
assert.ok(capabilities.readApis.includes('getDetailedReport'));
assert.ok(capabilities.readApis.includes('getKdsLoadCombinationCoverage'));
assert.ok(capabilities.executeActions.includes('openNativeDetailedReport'));
assert.ok(capabilities.milestones.some((item) => item.id === 'M36'));

const button = document.getElementById('mDesignReport');
button.click();
assert.equal(document.getElementById('reportModal').classList.contains('show'), true);
assert.equal(target.SStructuresDetailedReport.data.version, DETAILED_REPORT_VERSION);
assert.match(document.getElementById('reportBody').innerHTML, /Member Check Trace/);

const snapshot = target.SStructuresAgent.execute('openNativeDetailedReport', {
  generatedAt: '2026-06-27T00:00:00.000Z',
});
assert.equal(snapshot.detailedReport.version, DETAILED_REPORT_VERSION);
assert.equal(snapshot.detailedReport.modalOpen, true);
assert.equal(snapshot.detailedReport.memberCheckCount, model.members.length);

console.log(JSON.stringify({
  ok: true,
  version: DETAILED_REPORT_VERSION,
  htmlLength: snapshot.detailedReport.htmlLength,
  memberChecks: snapshot.detailedReport.memberCheckCount,
}, null, 2));

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
