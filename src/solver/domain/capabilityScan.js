export const DOMAIN_CAPABILITY_SCAN_VERSION = 'p8-m1-domain-capability-scan-v1';

export function scanAnalysisDomainCapabilities(model = {}, analysisCase = {}, options = {}) {
  const issues = [];
  for (const member of model.members || []) {
    if (['plate', 'shell', 'solid'].includes(member.type)) {
      issues.push(issue('NONLINEAR_ELEMENT_TYPE_UNSUPPORTED', 'member', member.id, `Element type ${member.type} is outside the production frame scope.`));
    }
    const rigidFactor = Number(member.endOffset?.rigidFactor ?? 1);
    if (!Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
      issues.push(issue('NONLINEAR_OFFSET_RIGID_FACTOR_UNSUPPORTED', 'member', member.id, 'Only fully rigid end offsets are supported.'));
    }
  }
  for (const load of model.loads || []) {
    if (load.follower === true || load.type === 'follower') {
      issues.push(issue('NONLINEAR_FOLLOWER_LOAD_UNSUPPORTED', 'load', load.id, 'Follower loads are not supported.'));
    }
  }
  for (const shell of model.shells || []) {
    issues.push(issue('NONLINEAR_SHELL_EQUIVALENT_ONLY', 'shell', shell.id, 'Shells are equivalent frame links and are not nonlinear shell FEM.'));
  }
  const ownerByNode = new Map();
  for (const diaphragm of (model.diaphragms || []).filter((item) => item.type === 'rigid')) {
    for (const nodeId of diaphragm.nodeIds || []) {
      const owner = ownerByNode.get(nodeId);
      if (owner && owner !== diaphragm.id) {
        issues.push(issue('RIGID_DIAPHRAGM_NODE_OVERLAP', 'node', nodeId, `Node belongs to rigid diaphragms ${owner} and ${diaphragm.id}.`));
      } else ownerByNode.set(nodeId, diaphragm.id);
    }
  }
  issues.sort((a, b) => `${a.code}:${a.entityType}:${a.entityId}`.localeCompare(`${b.code}:${b.entityType}:${b.entityId}`));
  const blockingCodes = new Set(options.allowedIssueCodes || []);
  const blocking = issues.filter((item) => !blockingCodes.has(item.code));
  return {
    version: DOMAIN_CAPABILITY_SCAN_VERSION,
    ok: blocking.length === 0,
    scope: options.scope || 'production-nonlinear-frame',
    caseId: analysisCase?.id || null,
    engineId: analysisCase?.engineId || null,
    issues,
    blocking,
  };
}

function issue(code, entityType, entityId, message) {
  return { code, entityType, entityId: entityId || null, message };
}
