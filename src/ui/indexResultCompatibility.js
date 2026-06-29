export const INDEX_LEGACY_RESULT_SHAPE_VERSION = 'm24-legacy-result-shape';

export function normalizeIndexResult(result, metadata = {}, options = {}) {
  if (!result || typeof result !== 'object') return result;
  const bridge = {
    version: options.bridgeVersion || 'm9-index-engine-bridge',
    ui: 'index',
    source: 'src-engine',
    requestedAt: metadata.requestedAt || null,
  };
  Object.defineProperty(result, 'bridge', {
    configurable: true,
    enumerable: true,
    value: bridge,
  });

  if (result.byCombo && typeof result.byCombo === 'object') {
    for (const [comboId, comboResult] of Object.entries(result.byCombo)) {
      normalizeResultSet(comboResult, comboId);
    }
  }
  normalizeResultSet(result.envelope, 'ENV');
  if (result.pDelta?.envelope) normalizeResultSet(result.pDelta.envelope, 'PDELTA_ENV');
  result.legacyResultShape = buildLegacyResultShapeSummary(result);

  return result;
}

function normalizeResultSet(resultSet, comboId) {
  if (!resultSet || typeof resultSet !== 'object') return;
  if (!resultSet.comboId) resultSet.comboId = comboId;
  if (!resultSet.id) resultSet.id = comboId;
  if (resultSet.disp && !resultSet.nodeDisplacements) resultSet.nodeDisplacements = resultSet.disp;
  if (!resultSet.disp && resultSet.nodeDisplacements) resultSet.disp = resultSet.nodeDisplacements;
  if (resultSet.nodeDisplacements && !resultSet.displacements) resultSet.displacements = resultSet.nodeDisplacements;
  if (!resultSet.memberResults) resultSet.memberResults = {};
  if (!resultSet.reactions) resultSet.reactions = {};
  if (!resultSet.unstableMembers) resultSet.unstableMembers = new Set();
  if (Array.isArray(resultSet.unstableMembers)) resultSet.unstableMembers = new Set(resultSet.unstableMembers);
  for (const [memberId, memberResult] of Object.entries(resultSet.memberResults)) {
    normalizeMemberResult(memberResult, memberId, comboId);
  }
  for (const [nodeId, reaction] of Object.entries(resultSet.reactions)) {
    resultSet.reactions[nodeId] = normalizeReactionResult(reaction, nodeId);
  }
  if (resultSet.dmax == null) resultSet.dmax = maxResultDisplacement(resultSet);
  if (resultSet.maxRatio == null) resultSet.maxRatio = maxResultRatio(resultSet);
  if (resultSet.okCount == null || resultSet.ngCount == null) {
    const counts = countMemberChecks(resultSet.memberResults);
    if (resultSet.okCount == null) resultSet.okCount = counts.ok;
    if (resultSet.ngCount == null) resultSet.ngCount = counts.ng;
  }
  if (!resultSet.summary) resultSet.summary = {};
  if (resultSet.summary.maxDisplacement == null) resultSet.summary.maxDisplacement = resultSet.dmax || 0;
  if (resultSet.summary.maxRatio == null) resultSet.summary.maxRatio = resultSet.maxRatio || 0;
  if (resultSet.summary.maxUtilization == null) resultSet.summary.maxUtilization = resultSet.maxRatio || 0;
  resultSet.envelopeSummary = resultSet.summary;
  resultSet.legacyShape = summarizeResultSetCompatibility(resultSet);
}

function normalizeMemberResult(memberResult, memberId, comboId) {
  if (!memberResult || typeof memberResult !== 'object') return;
  if (!memberResult.id) memberResult.id = memberId;
  if (!memberResult.memberId) memberResult.memberId = memberId;
  for (const key of ['N', 'Vy', 'Vz', 'Tq', 'My', 'Mz']) {
    if (!Array.isArray(memberResult[key])) memberResult[key] = [];
  }
  memberResult.values = {
    N: memberResult.N,
    Vy: memberResult.Vy,
    Vz: memberResult.Vz,
    Tq: memberResult.Tq,
    My: memberResult.My,
    Mz: memberResult.Mz,
  };
  memberResult.shear = { y: memberResult.Vy, z: memberResult.Vz };
  memberResult.moments = { y: memberResult.My, z: memberResult.Mz };
  memberResult.axial = memberResult.N;
  if (memberResult.Nmax == null) memberResult.Nmax = maxAbs(memberResult.N);
  if (memberResult.Vymax == null) memberResult.Vymax = maxAbs(memberResult.Vy);
  if (memberResult.Vzmax == null) memberResult.Vzmax = maxAbs(memberResult.Vz);
  if (memberResult.Tmax == null) memberResult.Tmax = maxAbs(memberResult.Tq);
  if (memberResult.Mymax == null) memberResult.Mymax = maxAbs(memberResult.My);
  if (memberResult.Mzmax == null) memberResult.Mzmax = maxAbs(memberResult.Mz);
  if (memberResult.dmaxM == null) memberResult.dmaxM = maxShapeDisplacement(memberResult.shape);
  memberResult.deflection = {
    ...(memberResult.deflection || {}),
    dmax: memberResult.dmaxM || 0,
    max: memberResult.dmaxM || 0,
  };
  if (!memberResult.check) memberResult.check = {};
  const ratio = finiteNumber(memberResult.check.ratio, memberResult.utilization, 0);
  memberResult.check.ratio = ratio;
  if (memberResult.check.ok == null) memberResult.check.ok = ratio <= 1;
  if (!memberResult.check.status) memberResult.check.status = memberResult.check.ok ? 'OK' : 'NG';
  if (!memberResult.check.comboId) memberResult.check.comboId = comboId;
  memberResult.utilization = ratio;
  memberResult.maxRatio = ratio;
  memberResult.status = memberResult.check.status;
  memberResult.governingRatio = ratio;
  memberResult.governingType = memberResult.check.governing || memberResult.check.id || null;
  memberResult.governingComboId = memberResult.check.comboId || comboId;
}

function normalizeReactionResult(reaction, nodeId) {
  if (!reaction || typeof reaction !== 'object') {
    reaction = {};
  } else if (Array.isArray(reaction)) {
    reaction = {
      rx: reaction[0],
      ry: reaction[1],
      rz: reaction[2],
      rmx: reaction[3],
      rmy: reaction[4],
      rmz: reaction[5],
    };
  }
  if (!reaction.id) reaction.id = nodeId;
  if (!reaction.nodeId) reaction.nodeId = nodeId;
  for (const key of ['rx', 'ry', 'rz', 'rmx', 'rmy', 'rmz']) {
    if (reaction[key] == null) reaction[key] = 0;
  }
  reaction.values = [reaction.rx, reaction.ry, reaction.rz, reaction.rmx, reaction.rmy, reaction.rmz];
  reaction.force = { x: reaction.rx, y: reaction.ry, z: reaction.rz };
  reaction.moment = { x: reaction.rmx, y: reaction.rmy, z: reaction.rmz };
  reaction.RMx = reaction.rmx;
  reaction.RMy = reaction.rmy;
  reaction.RMz = reaction.rmz;
  return reaction;
}

function buildLegacyResultShapeSummary(analysis) {
  const active = analysis?.envelope || Object.values(analysis?.byCombo || {})[0] || null;
  return {
    version: INDEX_LEGACY_RESULT_SHAPE_VERSION,
    compatible: !!active && summarizeResultSetCompatibility(active).compatible,
    resultToggles: ['def', 'M', 'Q', 'N', 'react', 'chk', 'design', 'defl'],
    resultIds: [
      ...(analysis?.envelope ? ['ENV'] : []),
      ...Object.keys(analysis?.byCombo || {}),
      ...(analysis?.pDelta?.envelope ? ['PDELTA_ENV'] : []),
    ],
    fields: {
      displacement: ['disp', 'nodeDisplacements', 'displacements'],
      memberForces: ['memberResults.N', 'memberResults.Vy', 'memberResults.Vz', 'memberResults.My', 'memberResults.Mz'],
      reactions: ['reactions.rx', 'reactions.ry', 'reactions.rz', 'reactions.rmx', 'reactions.rmy', 'reactions.rmz'],
      design: ['design.summary', 'design.steel.memberResults', 'design.concrete.memberResults'],
      validation: ['validation.errors', 'validation.warnings'],
    },
  };
}

function summarizeResultSetCompatibility(resultSet) {
  const firstMember = Object.values(resultSet?.memberResults || {})[0] || null;
  const firstReaction = Object.values(resultSet?.reactions || {})[0] || null;
  const checks = {
    displacements: !!(resultSet?.disp && resultSet?.nodeDisplacements && resultSet?.displacements),
    memberForces: !!(
      firstMember
      && Array.isArray(firstMember.N)
      && Array.isArray(firstMember.Vy)
      && Array.isArray(firstMember.Vz)
      && Array.isArray(firstMember.My)
      && Array.isArray(firstMember.Mz)
    ),
    reactions: !!(
      firstReaction
      && firstReaction.values
      && firstReaction.force
      && firstReaction.moment
    ),
    designChecks: !!(firstMember?.check && firstMember.status && firstMember.utilization != null),
    summary: !!(resultSet?.summary && resultSet.summary.maxDisplacement != null && resultSet.summary.maxRatio != null),
  };
  return {
    version: INDEX_LEGACY_RESULT_SHAPE_VERSION,
    comboId: resultSet?.comboId || null,
    compatible: Object.values(checks).every(Boolean),
    checks,
  };
}

function maxResultDisplacement(resultSet) {
  let max = 0;
  for (const value of Object.values(resultSet?.disp || resultSet?.nodeDisplacements || {})) {
    if (Array.isArray(value)) max = Math.max(max, vectorNorm(value.slice(0, 3)));
  }
  for (const memberResult of Object.values(resultSet?.memberResults || {})) {
    max = Math.max(max, finiteNumber(memberResult?.dmaxM, 0));
  }
  return max;
}

function maxResultRatio(resultSet) {
  let max = 0;
  for (const memberResult of Object.values(resultSet?.memberResults || {})) {
    max = Math.max(max, finiteNumber(memberResult?.check?.ratio, memberResult?.utilization, 0));
  }
  return max;
}

function countMemberChecks(memberResults) {
  const counts = { ok: 0, ng: 0 };
  for (const memberResult of Object.values(memberResults || {})) {
    if (memberResult?.check?.ok) counts.ok += 1;
    else counts.ng += 1;
  }
  return counts;
}

function maxShapeDisplacement(shape) {
  if (!Array.isArray(shape)) return 0;
  let max = 0;
  for (const point of shape) {
    if (Array.isArray(point)) max = Math.max(max, vectorNorm(point.slice(0, 3)));
    else if (point && typeof point === 'object') max = Math.max(max, vectorNorm([point.x, point.y, point.z]));
  }
  return max;
}

function maxAbs(values) {
  return Math.max(0, ...values.map((value) => Math.abs(Number(value) || 0)));
}

function vectorNorm(values) {
  return Math.hypot(...values.map((value) => Number(value) || 0));
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}
