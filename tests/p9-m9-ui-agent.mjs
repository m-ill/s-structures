import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { analyzePhase15Architecture } from '../verification/harnesses/check-phase15-architecture.mjs';

const model = createModel();
model.nodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'N2', x: 0, y: 0, z: 3, mass: [10, 10, 10] },
];
model.members = [{ id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } }];
model.loadCases = [{ id: 'D', name: 'Dead', type: 'dead' }];
model.loadCombinations = [{ id: 'D1', name: 'Dead', type: 'service', factors: { D: 1 } }];
model.loads = [{ id: 'P1', type: 'nodal', node: 'N2', P: 10, dir: '-z', case: 'D' }];
model.analysisCases = [{ id: 'EL-STATIC', name: 'Static', kind: 'static', status: 'not-run', settings: { comboId: 'D1', pDeltaMethod: 'off' } }];

const document = createFakeIndexDocument();
buildNativeIndexShell(document);
const storage = new Map();
const target = {
  document,
  model: () => model,
  location: { search: '' },
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
  reanalyze() {},
  draw() {},
  getComputedStyle: (element) => ({ display: element.style?.display || 'block', visibility: element.style?.visibility || 'visible' }),
};
document.defaultView = target;
const bridge = installIndexEngineBridge(target);
const agent = target.SStructuresAgent;

target.SStructuresAnalysisCenter.open();
target.SStructuresAnalysisCenter.select('EL-STATIC');
assert.equal(target.SStructuresAnalysisCenter.getState().computeTarget, 'auto', 'P9-UI-08 shared compute target');
const gpuButton = document.getElementById('ssAcComputegpu');
assert.ok(gpuButton, 'P9-UI-09 capability control rendered');
assert.equal(gpuButton.disabled, true, 'unsupported GPU is not presented as usable');
assert.match(gpuButton.title, /qualification|WebGPU|GPU/i);

const uiPlan = bridge.planAnalysisRun({ caseId: 'EL-STATIC', computeTarget: 'cpu' });
const agentPlan = agent.planAnalysisRun({ caseId: 'EL-STATIC', computeTarget: 'cpu' });
assert.deepEqual(agentPlan.settingsBytes, uiPlan.settingsBytes, 'P9-UI-10 UI/Agent settings byte parity');
assert.equal(agentPlan.settingsHash, uiPlan.settingsHash);
assert.equal(agentPlan.planHash, uiPlan.planHash);

const job = agent.startAnalysisRun({ caseId: 'EL-STATIC', computeTarget: 'cpu', jobId: 'AGENT-STATIC' });
await bridge.getProductAnalysisService().wait(job.id);
const status = agent.getAnalysisRunStatus({ jobId: job.id });
const result = agent.getAnalysisRunResult({ jobId: job.id });
assert.equal(status.status, 'completed', 'P9-UI-11 shared job state');
assert.equal(result.productProvenance.planHash, status.planHash);
assert.equal(bridge.getAnalysisCaseResult('EL-STATIC').caseId, 'EL-STATIC');
assert.ok(agent.getCapabilities().modules.phase9ProductAnalysisService);
assert.ok(agent.getCapabilities().readApis.includes('exportAnalysisTelemetry'));
assert.ok(agent.getSnapshot().availableActions.includes('startAnalysisRun'));

const legacy = agent.runAnalysisCase({ id: 'EL-STATIC' });
assert.equal(legacy.deprecation.code, 'SYNC_PRODUCT_ANALYSIS_DEPRECATED', 'sync API deprecation surfaced');

const analysisRunnerSource = await fs.readFile(new URL('../src/ui/analysisRunners.js', import.meta.url), 'utf8');
assert.doesNotMatch(analysisRunnerSource, /from ['"]\.\.\/(?:solver\/linear3d|dynamics|nonlinear\/analysisRouter)/, 'P9-REF-10 no UI solver/backend imports');
assert.doesNotMatch(analysisRunnerSource, /\banalyzeModel\s*\(/, 'P9-REF-10 no UI direct solver call');
const phase15Architecture = await analyzePhase15Architecture();
const uiNumericFindings = phase15Architecture.forbiddenImports.filter((row) => row.rule === 'ui-numeric-core');
assert.equal(
  phase15Architecture.gate.uiNumericCoreImports,
  uiNumericFindings.length === 0,
  'the Phase15 UI numeric-core gate must be derived fail-closed from its findings',
);
assert.equal(phase15Architecture.gate.uiNumericCoreImports, false, 'P15-M8-F03 remains explicitly BLOCKED until service boundaries replace direct UI dependencies');
assert.ok(
  uiNumericFindings.some((row) => (
    row.source === 'src/ui/indexAgentApi.js'
      && row.target === 'src/dynamics/elasticCompleteness.js'
      && row.severity === 'High'
  )),
  'the direct indexAgentApi numeric dependency must remain visible as a Phase15 High finding',
);
for (const file of ['indexBridge.js', 'indexAgentApi.js', 'indexNativeAdvancedAnalysis.js', 'm3State.js']) {
  const source = await fs.readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"]\.\.\/index\.js['"]/, `P15-M8-F02 ${file} does not hide dependencies behind the root barrel`);
  assert.doesNotMatch(source, /\b(?:analyzeCoreModel|runCorePushover)\s*\(/, `P9-REF-10 ${file} has no direct numeric-core call`);
}
const centerSource = await fs.readFile(new URL('../src/ui/indexAnalysisCenter.js', import.meta.url), 'utf8');
assert.doesNotMatch(centerSource, /bridge\.runAnalysisCase\?\./, 'Analysis Center uses the product job contract');

console.log(JSON.stringify({
  ok: true,
  requirements: ['P9-UI-08~12', 'P9-REF-10'],
  jobId: job.id,
  planHash: status.planHash,
  settingsByteParity: true,
  planHashParity: true,
  resultRecord: bridge.getAnalysisCaseResult('EL-STATIC').runRecordId,
  gpuReason: bridge.getAnalysisCapabilities({ kind: 'static' }).targets.find((row) => row.id === 'gpu').reason,
  phase15Architecture: {
    qualificationStatus: phase15Architecture.gate.uiNumericCoreImports ? 'PASS' : 'BLOCKED',
    findingId: 'P15-M8-F03',
    uiNumericCoreFindings: uiNumericFindings.length,
  },
}, null, 2));
