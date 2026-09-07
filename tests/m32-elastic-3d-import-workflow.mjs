import assert from 'node:assert/strict';
import {
  TWO_STORY_ELASTIC_FRAME_VERSION,
  analyzeModel,
  createHtmlReport,
  createModel,
  createTwoStoryElasticFrameModel,
  summarizeTwoStoryElasticWorkflow,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const importedModel = createTwoStoryElasticFrameModel();
const directAnalysis = analyzeModel(importedModel);
const workflowSummary = summarizeTwoStoryElasticWorkflow(importedModel, directAnalysis);

assert.equal(workflowSummary.version, TWO_STORY_ELASTIC_FRAME_VERSION);
assert.equal(directAnalysis.ok, true, JSON.stringify(directAnalysis.validation.errors, null, 2));
assert.equal(directAnalysis.validation.errors.length, 0);
assert.equal(importedModel.nodes.length, 27);
assert.equal(importedModel.members.length, 42);
assert.equal(importedModel.loads.length, 84);
assert.equal(importedModel.loadCases.length, 4);
assert.equal(importedModel.loadCombinations.length, 3);
assert.deepEqual(directAnalysis.combos.map((combo) => combo.id), ['EL-DL', 'EL-WX', 'EL-WY']);

assertCombo(directAnalysis.byCombo['EL-DL'], { load: [0, 0, -1056], reaction: [0, 0, 1056] });
assertCombo(directAnalysis.byCombo['EL-WX'], { load: [90, 0, -891], reaction: [-90, 0, 891] });
assertCombo(directAnalysis.byCombo['EL-WY'], { load: [0, 75, -891], reaction: [0, -75, 891] });

assert.ok(directAnalysis.envelope.dmax > 0);
assert.ok(directAnalysis.envelope.maxRatio > 0);
assert.ok(directAnalysis.envelope.maxRatio < 1);

const report = createHtmlReport(importedModel, directAnalysis);
assert.match(report.html, /S-Structures/);
assert.match(report.html, /EL-WY/);

const { target } = createTarget();
installIndexEngineBridge(target);
let snapshot = target.SStructuresAgent.execute('setModel', { model: importedModel });
assert.equal(snapshot.model.nodeCount, 27);
assert.equal(snapshot.model.memberCount, 42);
assert.equal(snapshot.model.loadCount, 84);
assert.equal(snapshot.analysis.ok, true);

snapshot = target.SStructuresAgent.runAnalysis();
assert.equal(snapshot.analysis.ok, true);
assert.equal(snapshot.analysis.comboCount, 3);
assert.ok(snapshot.analysis.maxDisplacement > 0);
assert.ok(snapshot.analysis.maxRatio < 1);

const visuals = target.SStructuresAgent.getResultVisuals({ resultId: 'EL-WY' });
assert.equal(visuals.nodes.length, 27);
assert.equal(visuals.members.length, 42);
assert.equal(visuals.loads.length, 84);
assert.ok(visuals.reactions.length >= 9);
assert.ok(visuals.deformedNodes.some((node) => {
  const base = visuals.nodes.find((item) => item.id === node.id);
  return Math.hypot(node.x - base.x, node.y - base.y, node.z - base.z) > 0;
}));

const agentReport = target.SStructuresAgent.prepareResultView('getReport', { title: 'Two-story 3D elastic workflow' });
assert.equal(agentReport.data.model.nodeCount, 27);
assert.equal(agentReport.data.analysis.ok, true);
assert.ok(agentReport.html.includes('Two-story 3D elastic workflow'));

assert.equal(workflowSummary.importReadiness.targetSources.includes('drawing-image'), true);
assert.equal(workflowSummary.importReadiness.targetSources.includes('mgt-file'), true);
assert.equal(workflowSummary.importReadiness.canonicalEntry, 'SStructuresAgent.execute("setModel", { model })');
assert.equal(workflowSummary.model.stories, 2);
assert.equal(workflowSummary.analysis.ok, true);

console.log(JSON.stringify({
  ok: true,
  version: TWO_STORY_ELASTIC_FRAME_VERSION,
  nodes: workflowSummary.model.nodeCount,
  members: workflowSummary.model.memberCount,
  loads: workflowSummary.model.loadCount,
  combos: workflowSummary.analysis.comboIds,
  maxEnvelopeDisplacement: workflowSummary.analysis.maxEnvelopeDisplacement,
  maxEnvelopeUtilization: workflowSummary.analysis.maxEnvelopeUtilization,
}, null, 2));

function assertCombo(result, expected) {
  assert.equal(result.ok, true);
  assert.ok(result.summary.equilibriumResidual < 1e-8, `equilibrium residual too high: ${result.summary.equilibriumResidual}`);
  assertVector(result.summary.totalLoad, expected.load);
  assertVector(result.summary.totalReaction, expected.reaction);
  assert.ok(result.summary.maxDisplacement > 0);
  assert.ok(result.maxRatio > 0);
}

function assertVector(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index] - expected[index]) < 1e-8, `expected ${expected[index]}, got ${actual[index]}`);
  }
}

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const model = createModel();
  let result = null;
  const target = {
    document,
    location: { pathname: '/index.html', search: '', hash: '' },
    history: { replaceState: () => {} },
    localStorage: createMemoryStorage(),
    model: () => model,
    activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
    reanalyze: () => {
      result = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = result.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
      target.draw();
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
  return { target };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
