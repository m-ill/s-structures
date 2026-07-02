import assert from 'node:assert/strict';
import { createModel } from '../src/index.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import {
  AGENT_API_CONTROL_ID,
  AGENT_API_NODE_ID,
  AGENT_COMMAND_HASH_KEY,
  AGENT_COMMAND_EVENT,
  AGENT_COMMAND_MESSAGE_TYPE,
  AGENT_RESPONSE_MESSAGE_TYPE,
  INDEX_AGENT_COMMAND_BRIDGE_VERSION,
} from '../src/ui/indexAgentCommandBridge.js';
import { buildNativeIndexShell, createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';

const { target, document, model, counters } = createTarget();
installIndexEngineBridge(target);

assert.equal(target.SStructuresAgentCommandBridge.version, INDEX_AGENT_COMMAND_BRIDGE_VERSION);
assert.equal(target.SStructuresAgent.getCapabilities().modules.agentCommandBridge, INDEX_AGENT_COMMAND_BRIDGE_VERSION);
assert.ok(target.SStructuresAgent.getCapabilities().dataContracts.includes('agentCommandBridge'));
assert.ok(target.SStructuresAgent.getCapabilities().milestones.some((item) => item.id === 'M31'));

const apiNode = document.getElementById(AGENT_API_NODE_ID);
assert.ok(apiNode, 'agent API node should be created');
assert.equal(apiNode.getAttribute('data-agent-id'), AGENT_API_CONTROL_ID);
assert.equal(apiNode.getAttribute('data-command-event'), AGENT_COMMAND_EVENT);
assert.equal(apiNode.getAttribute('data-command-message-type'), AGENT_COMMAND_MESSAGE_TYPE);
assert.equal(apiNode.getAttribute('data-command-hash-key'), AGENT_COMMAND_HASH_KEY);

let response = sendCommand({
  id: 'clear',
  method: 'execute',
  action: 'nativeClearPage',
});
assert.equal(response.ok, true);
assert.equal(response.data.model.nodeCount, 0);

response = sendCommand({
  id: 'left-column',
  method: 'execute',
  action: 'nativeAddColumn',
  payload: { base: [0, 0, 0], height: 3, support: 'fixed' },
});
assert.equal(response.ok, true);
const leftTop = response.data.nativeActionResult.topNodeId;
assert.equal(response.data.model.memberCount, 1);
assert.equal(readSummary().nativeActionResult.topNodeId, leftTop);

response = sendCommand({
  id: 'right-column',
  method: 'execute',
  action: 'nativeAddColumn',
  payload: { base: [4, 0, 0], height: 3, support: 'fixed' },
});
const rightTop = response.data.nativeActionResult.topNodeId;

response = sendCommand({
  id: 'beam',
  method: 'execute',
  action: 'nativeDrawMember',
  payload: { n1: leftTop, n2: rightTop, id: 'MBRIDGE' },
});
assert.equal(response.ok, true);
assert.equal(response.data.model.memberCount, 3);

response = sendCommand({
  id: 'load',
  method: 'execute',
  action: 'nativeAddUdl',
  payload: { memberId: 'MBRIDGE', w: 6, dir: '-z', case: 'D' },
});
assert.equal(response.ok, true);
assert.equal(response.data.model.loadCount, 1);

response = sendCommand({ id: 'snapshot', method: 'getSnapshot' });
assert.equal(response.ok, true);
assert.equal(response.data.model.nodeCount, 4);
assert.equal(response.data.model.memberCount, 3);
assert.equal(response.data.agentCommandBridge.commandCount, 6);

response = sendCommand({ id: 'analysis', method: 'runAnalysis' });
assert.equal(response.ok, true);
assert.equal(response.data.analysis.ok, true);
assert.ok(response.data.analysis.maxDisplacement > 0);
assert.equal(readSummary().analysis.ok, true);

response = sendCommand({ id: 'visuals', method: 'getResultVisuals' });
assert.equal(response.ok, true);
assert.equal(readSummary().resultVisuals.nodeCount, 4);
assert.equal(readSummary().resultVisuals.memberCount, 3);

response = sendCommand({ id: 'loads-v2', method: 'getLoadsV2Trace', payload: { seismicBaseShear: 90 } });
assert.equal(response.ok, true);
assert.equal(response.data.version, 'p3-m13-loads-v2-trace');

response = sendCommand({ id: 'import-review', method: 'getPhase3ImportMilestoneReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'import-pipeline-review-required');

response = sendCommand({ id: 'elastic-review', method: 'getPhase3ElasticMilestoneReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'elastic-completeness-engineer-review-required');

response = sendCommand({ id: 'design-review', method: 'getPhase3DesignMilestoneReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'detailed-design-engineer-review-required');

response = sendCommand({ id: 'drawing-validation-review', method: 'getPhase3DrawingImportValidationReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'collect-drawing-import-validation-evidence');

response = sendCommand({ id: 'engineering-validation-review', method: 'getPhase3EngineeringValidationReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'collect-engineering-validation-evidence');

response = sendCommand({ id: 'nonlinear-review', method: 'getPhase3NonlinearMilestoneReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'nonlinear-engine-review-required');

response = sendCommand({ id: 'productization-review', method: 'getPhase3ProductizationMilestoneReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'productization-owner-review-required');

response = sendCommand({ id: 'owner-signoff-review', method: 'getPhase3OwnerSignoffReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'collect-owner-signoff-evidence');

response = sendCommand({ id: 'practice-validation-review', method: 'getPhase3PracticeValidationReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'collect-practice-validation-evidence-before-production-use');

response = sendCommand({ id: 'pointcloud-validation-review', method: 'getPhase3PointCloudValidationReview' });
assert.equal(response.ok, true);
assert.equal(response.data.summary.agentDecision, 'collect-pointcloud-validation-evidence');

response = sendCommand({ id: 'nonlinear-trace', method: 'getNonlinearAnalysisTrace' });
assert.equal(response.ok, true);
assert.equal(response.data.version, 'p3-m16-nonlinear-trace');

response = sendCommand({
  id: 'bad-action',
  method: 'execute',
  action: 'missingAction',
});
assert.equal(response.ok, false);
assert.match(response.error.message, /Unsupported S-Structures agent action/);

response = sendMessageCommand({
  type: AGENT_COMMAND_MESSAGE_TYPE,
  id: 'screen-message',
  method: 'getScreenState',
});
assert.equal(response.ok, true);
assert.equal(response.data.agentCommandBridge.commandCount, 22);
assert.equal(target.lastPostedMessage.type, AGENT_RESPONSE_MESSAGE_TYPE);
assert.equal(target.lastPostedMessage.response.id, 'screen-message');

response = sendHashCommand({
  id: 'hash-capabilities',
  method: 'getCapabilities',
});
assert.equal(response.ok, true);
assert.ok(response.data.readApis.includes('URL hash: #sstructures-command='));
assert.equal(target.location.hash, '');
assert.equal(target.history.replacedUrl, '/index.html');

const state = target.SStructuresAgentCommandBridge.getState();
assert.equal(state.commandCount, 23);
assert.equal(state.errorCount, 1);
assert.ok(state.availableMethods.includes('getPhase3ImportMilestoneReview'));
assert.ok(state.availableMethods.includes('getPhase3ElasticMilestoneReview'));
assert.ok(state.availableMethods.includes('getPhase3DesignMilestoneReview'));
assert.ok(state.availableMethods.includes('getPhase3DrawingImportValidationReview'));
assert.ok(state.availableMethods.includes('getPhase3EngineeringValidationReview'));
assert.ok(state.availableMethods.includes('getPhase3NonlinearMilestoneReview'));
assert.ok(state.availableMethods.includes('getPhase3PointCloudValidationReview'));
assert.ok(state.availableMethods.includes('getPhase3PracticeValidationReview'));
assert.ok(state.availableMethods.includes('getPhase3ProductizationMilestoneReview'));
assert.ok(state.availableMethods.includes('getPhase3OwnerSignoffReview'));
assert.ok(counters.reanalyze >= 6);

console.log(JSON.stringify({
  ok: true,
  version: INDEX_AGENT_COMMAND_BRIDGE_VERSION,
  nodes: model.nodes.length,
  members: model.members.length,
  loads: model.loads.length,
  commandCount: state.commandCount,
}, null, 2));

function sendCommand(detail) {
  document.dispatchEvent({ type: AGENT_COMMAND_EVENT, detail });
  return JSON.parse(apiNode.textContent);
}

function sendMessageCommand(data) {
  target.emitMessage(data);
  return JSON.parse(apiNode.textContent);
}

function sendHashCommand(command) {
  target.location.hash = `#${AGENT_COMMAND_HASH_KEY}=${encodeURIComponent(JSON.stringify(command))}`;
  target.emitHashChange();
  return JSON.parse(apiNode.textContent);
}

function readSummary() {
  return JSON.parse(apiNode.getAttribute('data-response-summary'));
}

function createTarget() {
  const document = createFakeIndexDocument();
  buildNativeIndexShell(document);
  const model = createModel();
  let result = null;
  const counters = { reanalyze: 0, draw: 0 };
  const target = {
    eventHandlers: {},
    lastPostedMessage: null,
    document,
    location: { pathname: '/index.html', search: '', hash: '' },
    history: {
      replacedUrl: null,
      replaceState(_state, _title, url) {
        this.replacedUrl = url;
        target.location.hash = '';
      },
    },
    localStorage: createMemoryStorage(),
    model: () => model,
    activeResult: () => result?.pDelta?.envelope || result?.envelope || null,
    reanalyze: () => {
      counters.reanalyze += 1;
      result = target.analyzeModel(model);
      document.getElementById('statusTxt').textContent = result.ok ? 'OK' : 'NG';
      document.getElementById('statusChip').textContent = result.ok ? 'OK' : 'NG';
      target.draw();
      return result;
    },
    draw: () => {
      counters.draw += 1;
    },
    getComputedStyle(element) {
      return {
        display: element.style?.display || 'block',
        visibility: element.style?.visibility || 'visible',
      };
    },
    addEventListener(type, handler) {
      this.eventHandlers[type] = this.eventHandlers[type] || [];
      this.eventHandlers[type].push(handler);
    },
    postMessage(data) {
      this.lastPostedMessage = data;
    },
    emitMessage(data) {
      for (const handler of this.eventHandlers.message || []) {
        handler.call(this, { type: 'message', data, source: this });
      }
    },
    emitHashChange() {
      for (const handler of this.eventHandlers.hashchange || []) {
        handler.call(this, { type: 'hashchange', target: this });
      }
    },
  };
  document.defaultView = target;
  return { target, document, model, counters };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
