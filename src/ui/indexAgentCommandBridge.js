export const INDEX_AGENT_COMMAND_BRIDGE_VERSION = 'm31-agent-command-bridge';
export const AGENT_COMMAND_EVENT = 'sstructures:agent-command';
export const AGENT_RESPONSE_EVENT = 'sstructures:agent-response';
export const AGENT_COMMAND_MESSAGE_TYPE = 'sstructures:agent-command';
export const AGENT_RESPONSE_MESSAGE_TYPE = 'sstructures:agent-response';
export const AGENT_COMMAND_HASH_KEY = 'sstructures-command';
export const AGENT_API_NODE_ID = 'sstructuresAgentApi';
export const AGENT_API_CONTROL_ID = 'agent-api-command-bridge';

const READ_METHODS = new Set([
  'getSnapshot',
  'getScreenState',
  'getCapabilities',
  'getModel',
  'getResults',
  'getResultView',
  'getResultVisuals',
  'getReport',
  'getDetailedReport',
  'getCalculationPackage',
  'getKdsLoadCombinationCoverage',
  'getKdsLoadCombinationRules',
  'getKdsLoadStandardRegistry',
  'getKdsLoadStandardAudit',
  'getDesignBasisLoadEstimation',
  'getDesignBasisInput',
  'getRcDetailingReport',
  'getRcDetailedDesignReport',
  'getSteelDetailingReport',
  'getP3DetailedDesignReport',
  'getP3IntegratedResults',
  'getLaunchReadinessReport',
  'getPhase3DesignMilestoneReview',
  'getPhase3DrawingImportValidationReview',
  'getPhase3ElasticMilestoneReview',
  'getPhase3ImportMilestoneReview',
  'getPhase3NonlinearMilestoneReview',
  'getPhase3PlanAlignment',
  'getPhase3PointCloudValidationReview',
  'getPhase3PracticeValidationReview',
  'getPhase3ProductizationMilestoneReview',
  'getConnectionFoundationReport',
  'getMemberDesignTraceReport',
  'getServiceabilityDriftReport',
  'getAdvancedElasticTrace',
  'getMaterialSectionRegistry',
  'getElasticExpansionTrace',
  'getWallSlabEquivalentTrace',
  'getLoadsV2Trace',
  'getDynamicCompletenessTrace',
  'getNonlinearAnalysisTrace',
  'getResultPostprocessing',
  'getDesignDemandPackage',
  'getPracticePlatformReadiness',
  'getPracticeValidationReport',
  'getPilotProjectValidation',
  'getCombinationEnvelopeContract',
  'getStorySummary',
  'getStoryMassSummary',
  'getEccentricStoryLoadDistribution',
  'getMemberReleaseSummary',
  'getMemberReleaseBenchmark',
  'getDiaphragmSummary',
  'getRigidDiaphragmBenchmark',
  'getBaselineContract',
  'getRuntimeDiagnostics',
]);

export function installIndexAgentCommandBridge(target = globalThis, agent = target?.SStructuresAgent) {
  if (!target || !agent) return null;
  if (target.SStructuresAgentCommandBridge) return target.SStructuresAgentCommandBridge;

  const doc = target.document || null;
  const node = ensureApiNode(doc);
  const state = {
    version: INDEX_AGENT_COMMAND_BRIDGE_VERSION,
    commandEvent: AGENT_COMMAND_EVENT,
    responseEvent: AGENT_RESPONSE_EVENT,
    commandMessageType: AGENT_COMMAND_MESSAGE_TYPE,
    responseMessageType: AGENT_RESPONSE_MESSAGE_TYPE,
    commandHashKey: AGENT_COMMAND_HASH_KEY,
    nodeId: AGENT_API_NODE_ID,
    controlId: AGENT_API_CONTROL_ID,
    commandCount: 0,
    errorCount: 0,
    lastCommand: null,
    lastResponse: null,
  };

  const bridge = {
    version: INDEX_AGENT_COMMAND_BRIDGE_VERSION,
    eventName: AGENT_COMMAND_EVENT,
    responseEventName: AGENT_RESPONSE_EVENT,
    messageType: AGENT_COMMAND_MESSAGE_TYPE,
    responseMessageType: AGENT_RESPONSE_MESSAGE_TYPE,
    hashKey: AGENT_COMMAND_HASH_KEY,
    node,
    getState() {
      return {
        ...state,
        ready: true,
        availableMethods: [
          ...READ_METHODS,
          'execute',
          'runAnalysis',
          'runPushover',
        ],
      };
    },
    run(command = {}) {
      const normalized = normalizeCommand(command);
      state.commandCount += 1;
      state.lastCommand = summarizeCommand(normalized);
      let response;
      try {
        const data = runAgentCommand(agent, normalized);
        response = {
          ok: true,
          id: normalized.id,
          method: normalized.method,
          action: normalized.action || null,
          data,
        };
      } catch (error) {
        state.errorCount += 1;
        response = {
          ok: false,
          id: normalized.id,
          method: normalized.method,
          action: normalized.action || null,
          error: {
            name: error?.name || 'Error',
            message: error?.message || String(error),
          },
        };
      }
      state.lastResponse = summarizeResponse(response);
      writeApiNode(node, response);
      dispatchResponse(target, response);
      return response;
    },
  };

  target.SStructuresAgentCommandBridge = bridge;
  if (doc?.addEventListener) {
    doc.addEventListener(AGENT_COMMAND_EVENT, (event) => {
      bridge.run(event?.detail || readCommandNode(node));
    });
  }
  if (target.addEventListener) {
    target.addEventListener('message', (event) => {
      const command = readMessageCommand(target, event);
      if (command) bridge.run(command);
    });
    target.addEventListener('hashchange', () => {
      const command = readHashCommand(target.location?.hash);
      if (command) {
        bridge.run(command);
        clearCommandHash(target);
      }
    });
  }
  writeApiNode(node, {
    ok: true,
    ready: true,
    version: INDEX_AGENT_COMMAND_BRIDGE_VERSION,
    commandEvent: AGENT_COMMAND_EVENT,
    responseEvent: AGENT_RESPONSE_EVENT,
    commandMessageType: AGENT_COMMAND_MESSAGE_TYPE,
    responseMessageType: AGENT_RESPONSE_MESSAGE_TYPE,
    commandHashKey: AGENT_COMMAND_HASH_KEY,
  });
  const initialHashCommand = readHashCommand(target.location?.hash);
  if (initialHashCommand) {
    bridge.run(initialHashCommand);
    clearCommandHash(target);
  }
  return bridge;
}

function runAgentCommand(agent, command) {
  if (command.method === 'execute') {
    if (!command.action) throw new Error('Agent command requires action for execute.');
    return agent.execute(command.action, command.payload || {});
  }
  if (command.method === 'runAnalysis') return agent.runAnalysis();
  if (command.method === 'runPushover') return agent.runPushover(command.payload || {});
  if (READ_METHODS.has(command.method)) return agent[command.method](command.payload || {});
  throw new Error(`Unsupported agent API method: ${command.method}`);
}

function normalizeCommand(command) {
  const parsed = typeof command === 'string' ? JSON.parse(command) : command || {};
  return {
    id: String(parsed.id || parsed.commandId || `cmd-${Date.now()}`),
    method: String(parsed.method || (parsed.action ? 'execute' : 'getSnapshot')),
    action: parsed.action ? String(parsed.action) : null,
    payload: parsed.payload || parsed.args || {},
  };
}

function readMessageCommand(target, event) {
  const data = event?.data || null;
  if (!data || data.type !== AGENT_COMMAND_MESSAGE_TYPE) return null;
  if (event?.source && event.source !== target) return null;
  return data.command || data.detail || data;
}

function readHashCommand(hash) {
  const value = readHashValue(hash, AGENT_COMMAND_HASH_KEY) || readHashValue(hash, 'sscmd');
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch (_decodeError) {
      return null;
    }
  }
}

function readHashValue(hash, key) {
  const text = String(hash || '').replace(/^#/, '');
  if (!text) return null;
  try {
    return new URLSearchParams(text).get(key);
  } catch (_error) {
    return null;
  }
}

function clearCommandHash(target) {
  if (!readHashCommand(target?.location?.hash)) return;
  if (typeof target?.history?.replaceState !== 'function') return;
  const path = target.location?.pathname || '';
  const search = target.location?.search || '';
  target.history.replaceState(null, '', `${path}${search}`);
}

function ensureApiNode(doc) {
  if (!doc?.createElement) return null;
  let node = doc.getElementById?.(AGENT_API_NODE_ID);
  if (!node) {
    node = doc.createElement('div');
    node.id = AGENT_API_NODE_ID;
    node.setAttribute?.('id', AGENT_API_NODE_ID);
    doc.body?.appendChild?.(node);
  }
  node.hidden = true;
  node.style && (node.style.display = 'none');
  node.setAttribute?.('data-agent-id', AGENT_API_CONTROL_ID);
  node.setAttribute?.('data-api-version', INDEX_AGENT_COMMAND_BRIDGE_VERSION);
  node.setAttribute?.('data-command-event', AGENT_COMMAND_EVENT);
  node.setAttribute?.('data-response-event', AGENT_RESPONSE_EVENT);
  node.setAttribute?.('data-command-message-type', AGENT_COMMAND_MESSAGE_TYPE);
  node.setAttribute?.('data-response-message-type', AGENT_RESPONSE_MESSAGE_TYPE);
  node.setAttribute?.('data-command-hash-key', AGENT_COMMAND_HASH_KEY);
  node.setAttribute?.('aria-hidden', 'true');
  return node;
}

function readCommandNode(node) {
  if (!node?.getAttribute) return {};
  const text = node.getAttribute('data-command') || node.textContent || '{}';
  try {
    return JSON.parse(text);
  } catch (_error) {
    return {};
  }
}

function writeApiNode(node, payload) {
  if (!node) return;
  const text = JSON.stringify(payload);
  const summaryText = JSON.stringify(summarizePayload(payload));
  node.textContent = text;
  node.setAttribute?.('data-last-response', text);
  node.setAttribute?.('data-response-summary', summaryText);
  node.setAttribute?.('data-ok', payload.ok ? 'true' : 'false');
  if (payload.id) node.setAttribute?.('data-command-id', payload.id);
}

function dispatchResponse(target, response) {
  const EventCtor = target?.CustomEvent || globalThis.CustomEvent;
  if (target?.document?.dispatchEvent && typeof EventCtor === 'function') {
    target.document.dispatchEvent(new EventCtor(AGENT_RESPONSE_EVENT, {
      detail: response,
    }));
  }
  if (typeof target?.postMessage === 'function') {
    target.postMessage({
      type: AGENT_RESPONSE_MESSAGE_TYPE,
      response,
    }, '*');
  }
}

function summarizeCommand(command) {
  return {
    id: command.id,
    method: command.method,
    action: command.action || null,
  };
}

function summarizeResponse(response) {
  return {
    ok: !!response.ok,
    id: response.id || null,
    method: response.method || null,
    action: response.action || null,
    error: response.error?.message || null,
  };
}

function summarizePayload(payload) {
  const data = payload?.data || {};
  return {
    ok: !!payload?.ok,
    ready: !!payload?.ready,
    id: payload?.id || null,
    method: payload?.method || null,
    action: payload?.action || null,
    version: payload?.version || null,
    error: payload?.error?.message || null,
    model: summarizePayloadModel(data.model),
    analysis: summarizePayloadAnalysis(data.analysis),
    resultVisuals: summarizePayloadResultVisuals(data.resultVisuals || data),
    report: summarizePayloadReport(data),
    designBasisInput: summarizePayloadDesignBasisInput(data.designBasisInput),
    nativeActionResult: summarizeNativeActionResult(data.nativeActionResult),
    commandCount: data.agentCommandBridge?.commandCount ?? null,
    readApiCount: Array.isArray(data.readApis) ? data.readApis.length : null,
  };
}

function summarizePayloadModel(model) {
  if (!model || typeof model !== 'object') return null;
  return {
    nodeCount: model.nodeCount ?? null,
    memberCount: model.memberCount ?? null,
    loadCount: model.loadCount ?? null,
    loadCaseCount: model.loadCaseCount ?? null,
    combinationCount: model.combinationCount ?? null,
  };
}

function summarizePayloadAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return null;
  return {
    ok: analysis.ok ?? null,
    comboCount: analysis.comboCount ?? null,
    errorCount: analysis.errorCount ?? null,
    warningCount: analysis.warningCount ?? null,
    maxDisplacement: analysis.maxDisplacement ?? null,
    maxRatio: analysis.maxRatio ?? null,
  };
}

function summarizePayloadResultVisuals(visuals) {
  if (!visuals || typeof visuals !== 'object') return null;
  const nodeCount = Array.isArray(visuals.nodes) ? visuals.nodes.length : visuals.nodeCount;
  const memberCount = Array.isArray(visuals.members) ? visuals.members.length : visuals.memberCount;
  if (nodeCount == null && memberCount == null) return null;
  return {
    available: visuals.available ?? true,
    nodeCount: nodeCount ?? null,
    memberCount: memberCount ?? null,
    loadCount: Array.isArray(visuals.loads) ? visuals.loads.length : visuals.loadCount ?? null,
    reactionCount: Array.isArray(visuals.reactions) ? visuals.reactions.length : visuals.reactionCount ?? null,
    maxDisplacement: visuals.maxDisplacement ?? null,
    deformScale: visuals.deformScale ?? null,
  };
}

function summarizePayloadReport(report) {
  if (!report || typeof report !== 'object' || !report.html || !report.data) return null;
  return {
    title: report.data.title || null,
    ok: report.data.analysis?.ok ?? null,
    nodeCount: report.data.model?.nodeCount ?? null,
    memberCount: report.data.model?.memberCount ?? null,
    loadCount: report.data.model?.loadCount ?? null,
    htmlLength: String(report.html).length,
  };
}

function summarizePayloadDesignBasisInput(input) {
  if (!input || typeof input !== 'object') return null;
  return {
    version: input.version || null,
    occupancy: input.basis?.occupancy || null,
    previewGeneratedLoadCount: input.preview?.summary?.generatedLoadCount ?? null,
    generatedModelLoadCount: input.generatedModelLoadCount ?? null,
  };
}

function summarizeNativeActionResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    changed: result.changed ?? null,
    nodeId: result.nodeId || null,
    topNodeId: result.topNodeId || null,
    memberId: result.memberId || null,
    loadId: result.loadId || null,
    tool: result.tool || null,
  };
}
