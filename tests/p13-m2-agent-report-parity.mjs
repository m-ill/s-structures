import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const model = createReviewModel();
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
const bridge = installIndexEngineBridge(target);
const workspace = target.SStructuresPhase13Workspace;
const warning = workspace.getModelCheckSnapshot().issues.find((item) => item.severity === 'warning');
assert.ok(warning);
workspace.waiveIssue(warning.issueId, {
  reviewer: 'Parity Reviewer',
  reason: '독립 도면 검토 완료',
  createdAt: '2026-08-05T00:00:00.000Z',
});

const uiSnapshot = workspace.getModelCheckSnapshot();
const bridgeSnapshot = bridge.getPhase13ModelCheck();
const agentSnapshot = target.SStructuresAgent.getPhase13ModelCheck();
assert.deepEqual(bridgeSnapshot, uiSnapshot);
assert.deepEqual(agentSnapshot, uiSnapshot);
assert.deepEqual(target.SStructuresAgent.getPhase13IssueWaivers(), uiSnapshot.waivers);
assert.equal(uiSnapshot.summary.waived, 1);

const detailed = bridge.getDetailedReport();
const agentDetailed = target.SStructuresAgent.getDetailedReport();
assert.deepEqual(detailed.data.phase13ModelCheck, uiSnapshot);
assert.deepEqual(agentDetailed.data.phase13ModelCheck, uiSnapshot);
assert.match(detailed.html, /data-section="phase13-model-check"/);
assert.ok(detailed.html.includes(warning.issueId));
assert.ok(target.SStructuresAgent.getCapabilities().readApis.includes('getPhase13ModelCheck'));
assert.ok(target.SStructuresAgent.getCapabilities().readApis.includes('getPhase13IssueWaivers'));

console.log(JSON.stringify({
  ok: true,
  milestone: 'P13-M2',
  issueId: warning.issueId,
  uiApiReportParity: true,
  waiverCount: uiSnapshot.waivers.length,
}, null, 2));

function createReviewModel() {
  const result = createModel();
  result.meta = { ...(result.meta || {}), id: 'P13-M2-PARITY', revisionId: 'REV-01' };
  result.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 0, y: 0, z: 4, support: null },
    { id: 'N-REVIEW', x: 5, y: 5, z: 0, support: null },
  ];
  result.members = [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
  }];
  result.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
  result.loadCombinations = [{ id: 'CO1', name: 'D', type: 'strength', factors: { D: 1 } }];
  result.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 10, dir: '-z', case: 'D' }];
  return result;
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
