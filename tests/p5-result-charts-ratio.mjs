import assert from 'node:assert/strict';
import {
  createTwoStoryElasticFrameModel,
  validateModel,
} from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildAnalysisCaseResultView } from '../src/ui/indexResultViews.js';
import {
  buildCapacityChart,
  buildModalParticipationChart,
  buildSpectrumChart,
  buildTimeHistoryChart,
  RESULT_CHARTS_VERSION,
} from '../src/ui/resultCharts.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

assertChart(buildCapacityChart([
  { controlDisplacement: 0, baseShear: 0 },
  { controlDisplacement: 0.02, baseShear: 30 },
], { firstYield: { controlDisplacement: 0.02, baseShear: 30 } }), 'polyline');
assertChart(buildTimeHistoryChart([
  { time: 0, displacement: 0 },
  { time: 0.02, displacement: -0.01 },
  { time: 0.04, displacement: 0.015 },
]), 'polyline');
assertChart(buildSpectrumChart({ combined: { x: { participatingMassRatio: 0.62 }, y: { participatingMassRatio: 0.48 } } }), 'rect');
assertChart(buildModalParticipationChart([{ index: 1, participatingMassRatio: 0.45 }, { index: 2, participatingMassRatio: 0.3 }]), 'rect');

const document = createFakeIndexDocument();
buildNativeIndexShell(document);

const model = createTwoStoryElasticFrameModel();
for (const node of model.nodes) {
  if (!node.support) node.mass = [5, 5, 5];
}

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

agent.execute('addAnalysisCase', { id: 'AC_STATIC_RATIO', kind: 'static', settings: { pDelta: false } });
agent.execute('addAnalysisCase', { id: 'AC_MODAL_CHART', kind: 'modal', settings: { modalModeCount: 3 } });
agent.execute('addAnalysisCase', { id: 'AC_RSA_CHART', kind: 'responseSpectrum', settings: { modalModeCount: 3, spectrum: { method: 'SRSS', directions: ['x', 'y'] } } });
agent.execute('addAnalysisCase', { id: 'AC_PUSH_CHART', kind: 'pushover', settings: { steps: 3, referenceBaseShear: 50 } });
agent.execute('addAnalysisCase', { id: 'AC_NLTH_CHART', kind: 'nlth', settings: { record: 'sample-a', scale: 1, dt: 0.02, accelerations: [0, 0.05, -0.05, 0.04], mass: 1, stiffness: 80, yieldForce: 0.08 } });
bridge.runAnalysisCases();

const ratioToggle = document.querySelector('[data-res="ratio"]');
assert.ok(ratioToggle, 'ratio result toggle should exist');
ratioToggle.click();
assert.equal(target.SStructuresRatioVisible, true);

target.SStructuresAnalysisCenter.select('AC_STATIC_RATIO');
const staticView = target.SStructuresAnalysisCenter.getState().resultView;
assert.equal(staticView.overlayData.memberRatioMap.version, 'p5-m10-member-ratio-map');
assert.ok(staticView.overlayData.memberRatioMap.rows.length > 0);
assert.ok(staticView.overlayData.memberRatioMap.rows.every((row) => row.color));
const directStaticView = buildAnalysisCaseResultView(model, bridge.getAnalysisCaseResult('AC_STATIC_RATIO'));
assert.ok(directStaticView.overlayData.ratioLegend.length >= 3);
const ratioLegend = document.getElementById('ssRatioLegend');
assert.ok(ratioLegend, 'ratio legend should render');
assert.equal(ratioLegend.getAttribute('data-version'), 'p5-m10-member-ratio-map');

target.SStructuresAnalysisCenter.select('AC_PUSH_CHART');
assertChartElement(document, 'ssChartCapacity', 'polyline');

target.SStructuresAnalysisCenter.select('AC_NLTH_CHART');
assertChartElement(document, 'ssChartTimeHistory', 'polyline');

target.SStructuresAnalysisCenter.select('AC_MODAL_CHART');
assertChartElement(document, 'ssChartModal', 'rect');

target.SStructuresAnalysisCenter.select('AC_RSA_CHART');
assertChartElement(document, 'ssChartSpectrum', ['rect', 'polyline']);

const capabilities = agent.getCapabilities();
assert.ok(capabilities.milestones.some((item) => item.id === 'P5-M10'));
assert.equal(capabilities.modules.phase5ResultCharts, RESULT_CHARTS_VERSION);
assert.ok(capabilities.dataContracts.includes('phase5MemberRatioMap'));
assert.ok(capabilities.dataContracts.includes('phase5ResultCharts'));

const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

console.log(JSON.stringify({
  ok: true,
  chartVersion: RESULT_CHARTS_VERSION,
  ratioMembers: staticView.overlayData.memberRatioMap.rows.length,
  maxRatio: staticView.overlayData.memberRatioMap.maxRatio,
}, null, 2));

function assertChart(chart, shape) {
  assert.equal(chart.version, RESULT_CHARTS_VERSION);
  assert.ok(chart.svg.includes('<svg'));
  assert.ok(chart.svg.includes(shape));
  assert.ok(chart.pointCount > 0);
}

function assertChartElement(doc, id, shape) {
  const element = doc.getElementById(id);
  assert.ok(element, `${id} should exist`);
  assert.equal(element.getAttribute('data-chart-version'), RESULT_CHARTS_VERSION);
  const shapes = Array.isArray(shape) ? shape : [shape];
  assert.ok(shapes.some((item) => element.innerHTML.includes(item)), `${id} should include ${shapes.join(' or ')}`);
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
