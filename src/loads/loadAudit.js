import { inferLoadCaseFamily } from './loadCaseMetadata.js';

export const LOAD_AUDIT_VERSION = 'p7-m6-load-audit-v1';

export const LOAD_AUDIT_CODES = Object.freeze({
  DUPLICATE_ID: 'duplicate-load-id',
  DUPLICATE_CONTENT: 'duplicate-load-content',
  DUPLICATE_GENERATED_KEY: 'duplicate-generated-key',
  GENERATED_KEY_CONFLICT: 'generated-key-conflict',
  ZERO_LOAD: 'zero-load',
  ORPHAN_CASE: 'orphan-load-case',
  ORPHAN_NODE: 'orphan-load-node',
  ORPHAN_MEMBER: 'orphan-load-member',
  ORPHAN_TARGET: 'orphan-load-target',
  ORPHAN_COMBINATION_CASE: 'orphan-combination-case',
  UNIT_MISMATCH: 'load-unit-mismatch',
  OPPOSITE_DIRECTION: 'opposite-direction-loads',
  DOUBLE_SELF_WEIGHT: 'double-self-weight-candidate',
});

export function buildLoadAudit(model = {}, options = {}) {
  const loads = Array.isArray(model.loads) ? model.loads : [];
  const loadCases = Array.isArray(model.loadCases) ? model.loadCases : [];
  const loadCombinations = Array.isArray(model.loadCombinations) ? model.loadCombinations : [];
  const nodeIds = new Set((model.nodes || []).map((node) => node?.id).filter(Boolean));
  const memberIds = new Set((model.members || []).map((member) => member?.id).filter(Boolean));
  const caseIds = new Set(loadCases.map((loadCase) => loadCase?.id).filter(Boolean));
  const caseById = new Map(loadCases.filter((item) => item?.id).map((item) => [item.id, item]));
  const issues = [];

  const duplicateIds = groupedDuplicates(loads, (load) => load?.id || null);
  for (const group of duplicateIds) issues.push(auditIssue(
    LOAD_AUDIT_CODES.DUPLICATE_ID,
    'error',
    `Load id ${group.key} is used ${group.items.length} times.`,
    group.items,
  ));

  const duplicateContent = groupedDuplicates(loads, semanticLoadSignature)
    .filter((group) => new Set(group.items.map((item) => item?.id)).size > 1);
  for (const group of duplicateContent) issues.push(auditIssue(
    LOAD_AUDIT_CODES.DUPLICATE_CONTENT,
    'warning',
    'Loads have identical case, target, direction, range, and magnitude.',
    group.items,
    { signature: group.key },
  ));

  const generatedKeyGroups = groupedDuplicates(loads, (load) => load?.generatedKey || null);
  const generatedKeyConflicts = [];
  for (const group of generatedKeyGroups) {
    const signatures = new Set(group.items.map(semanticLoadSignature));
    const conflict = signatures.size > 1;
    const code = conflict ? LOAD_AUDIT_CODES.GENERATED_KEY_CONFLICT : LOAD_AUDIT_CODES.DUPLICATE_GENERATED_KEY;
    const issue = auditIssue(
      code,
      conflict ? 'error' : 'warning',
      conflict
        ? 'The same generated key identifies different load definitions.'
        : 'The same generated load is stored more than once.',
      group.items,
      { generatedKey: group.key, userModified: group.items.some((item) => item.userModified === true) },
    );
    issues.push(issue);
    if (conflict) generatedKeyConflicts.push(issue);
  }

  const zeroLoads = [];
  const orphanLoads = [];
  const unitMismatches = [];
  for (const load of loads) {
    if (isZeroLoad(load, options.zeroTolerance)) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ZERO_LOAD,
        'warning',
        `Load ${load.id || '(missing id)'} has zero effect.`,
        [load],
        { magnitudes: loadMagnitudes(load) },
      );
      issues.push(issue);
      zeroLoads.push(issue);
    }
    if (load.case && !caseIds.has(load.case)) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ORPHAN_CASE,
        'error',
        `Load ${load.id || '(missing id)'} references undefined case ${load.case}.`,
        [load],
        { caseId: load.case },
      );
      issues.push(issue);
      orphanLoads.push(issue);
    }
    if (load.node && !nodeIds.has(load.node)) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ORPHAN_NODE,
        'error',
        `Load ${load.id || '(missing id)'} references missing node ${load.node}.`,
        [load],
        { nodeId: load.node },
      );
      issues.push(issue);
      orphanLoads.push(issue);
    }
    if (load.member && !memberIds.has(load.member)) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ORPHAN_MEMBER,
        'error',
        `Load ${load.id || '(missing id)'} references missing member ${load.member}.`,
        [load],
        { memberId: load.member },
      );
      issues.push(issue);
      orphanLoads.push(issue);
    }
    if (requiresNode(load) && !load.node || requiresMember(load) && !load.member) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ORPHAN_TARGET,
        'error',
        `Load ${load.id || '(missing id)'} has no required target.`,
        [load],
        { type: load.type || null },
      );
      issues.push(issue);
      orphanLoads.push(issue);
    }
    const expectedUnits = expectedLoadUnits(load.type);
    if (load.unit && expectedUnits.length && !expectedUnits.includes(normalizeUnit(load.unit))) {
      const issue = auditIssue(
        LOAD_AUDIT_CODES.UNIT_MISMATCH,
        'warning',
        `Load ${load.id || '(missing id)'} uses ${load.unit}; expected ${expectedUnits.join(' or ')}.`,
        [load],
        { unit: load.unit, expectedUnits },
      );
      issues.push(issue);
      unitMismatches.push(issue);
    }
  }

  const orphanCombinationCases = [];
  for (const combination of loadCombinations) {
    for (const caseId of Object.keys(combination?.factors || {})) {
      if (caseIds.has(caseId)) continue;
      const issue = auditIssue(
        LOAD_AUDIT_CODES.ORPHAN_COMBINATION_CASE,
        'error',
        `Combination ${combination.id || '(missing id)'} references undefined case ${caseId}.`,
        [],
        { combinationId: combination.id || null, caseId },
      );
      issues.push(issue);
      orphanCombinationCases.push(issue);
    }
  }

  const oppositeDirection = findOppositeDirectionGroups(loads);
  for (const group of oppositeDirection) issues.push(auditIssue(
    LOAD_AUDIT_CODES.OPPOSITE_DIRECTION,
    'info',
    'Loads with equal magnitude act in opposite directions on the same case and target.',
    group.items,
    { signature: group.key },
  ));

  const selfWeightCandidates = findDoubleSelfWeightCandidates(model, loads, caseById);
  for (const candidate of selfWeightCandidates) issues.push(auditIssue(
    LOAD_AUDIT_CODES.DOUBLE_SELF_WEIGHT,
    candidate.explicitSelfWeight ? 'error' : 'warning',
    candidate.explicitSelfWeight
      ? `Member ${candidate.memberId} has explicit self-weight while solver self-weight is enabled.`
      : `Member ${candidate.memberId} has a D-family gravity load while solver self-weight is enabled; verify it is superimposed load.`,
    candidate.loads,
    {
      memberId: candidate.memberId,
      caseIds: candidate.caseIds,
      explicitSelfWeight: candidate.explicitSelfWeight,
      certainty: candidate.explicitSelfWeight ? 'high' : 'candidate',
    },
  ));

  const severityCounts = countBy(issues, (item) => item.severity);
  const byCode = Object.fromEntries(Object.values(LOAD_AUDIT_CODES).map((code) => [
    code,
    issues.filter((item) => item.code === code),
  ]));
  const status = severityCounts.error > 0
    ? 'invalid'
    : severityCounts.warning > 0
      ? 'review-required'
      : 'clean';

  return {
    version: LOAD_AUDIT_VERSION,
    status,
    summary: {
      loadCount: loads.length,
      loadCaseCount: loadCases.length,
      combinationCount: loadCombinations.length,
      issueCount: issues.length,
      errorCount: severityCounts.error || 0,
      warningCount: severityCounts.warning || 0,
      infoCount: severityCounts.info || 0,
      duplicateIdGroupCount: duplicateIds.length,
      duplicateContentGroupCount: duplicateContent.length,
      zeroLoadCount: zeroLoads.length,
      orphanCount: orphanLoads.length + orphanCombinationCases.length,
      generatedKeyConflictCount: generatedKeyConflicts.length,
      doubleSelfWeightCandidateCount: selfWeightCandidates.length,
    },
    issues,
    byCode,
    duplicates: {
      ids: duplicateIds.map(groupSummary),
      content: duplicateContent.map(groupSummary),
      generatedKeys: generatedKeyGroups.map(groupSummary),
    },
    zeroLoads,
    orphans: {
      loads: orphanLoads,
      combinationCases: orphanCombinationCases,
    },
    generatedKeyConflicts,
    oppositeDirection: oppositeDirection.map(groupSummary),
    unitMismatches,
    selfWeightCandidates: selfWeightCandidates.map((candidate) => ({
      memberId: candidate.memberId,
      loadIds: candidate.loads.map((load) => load.id || null),
      caseIds: candidate.caseIds,
      explicitSelfWeight: candidate.explicitSelfWeight,
      certainty: candidate.explicitSelfWeight ? 'high' : 'candidate',
    })),
    totals: summarizeLoadMagnitudes(loads),
    limitations: [
      'Self-weight duplicate detection reports target-level candidates; a D-family load can legitimately be superimposed dead load.',
      'Magnitude totals remain separated by physical quantity and are not added across force, line load, moment, or temperature units.',
    ],
  };
}

export const auditModelLoads = buildLoadAudit;
export const auditLoads = buildLoadAudit;

function findDoubleSelfWeightCandidates(model, loads, caseById) {
  const enabled = model.analysisSettings?.includeSelfWeight === true
    || model.analysisSettings?.selfWeight?.enabled === true;
  if (!enabled) return [];
  const byMember = new Map();
  for (const load of loads) {
    if (!load.member || !isGravityMemberLoad(load)) continue;
    const loadCase = caseById.get(load.case) || { id: load.case, type: null };
    if (inferLoadCaseFamily(loadCase) !== 'D') continue;
    if (!byMember.has(load.member)) byMember.set(load.member, []);
    byMember.get(load.member).push(load);
  }
  return [...byMember.entries()].map(([memberId, memberLoads]) => ({
    memberId,
    loads: memberLoads,
    caseIds: [...new Set(memberLoads.map((load) => load.case).filter(Boolean))].sort(),
    explicitSelfWeight: memberLoads.some((load) => isExplicitSelfWeight(load, caseById.get(load.case))),
  })).sort((a, b) => String(a.memberId).localeCompare(String(b.memberId)));
}

function isExplicitSelfWeight(load, loadCase = {}) {
  const variant = String(load.variant || loadCase?.variant || '').trim().toLowerCase();
  const source = String(load.sourceId || load.generatedBy || load.source || '').trim().toLowerCase();
  const caseId = String(load.case || loadCase?.id || '').toUpperCase();
  return variant === 'self-weight'
    || variant === 'selfweight'
    || caseId === 'D-SW'
    || source.includes('self-weight')
    || source === 'selfweight';
}

function isGravityMemberLoad(load) {
  if (!['udl', 'udl-partial', 'trapezoid', 'point'].includes(load.type)) return false;
  const direction = effectiveDirection(load);
  return direction === '-z' || direction === 'z' || direction == null;
}

function groupedDuplicates(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, items: group }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function semanticLoadSignature(load = {}) {
  return stableJson({
    type: load.type || null,
    case: load.case || null,
    node: load.node || null,
    member: load.member || null,
    direction: normalizedDirectionValue(load),
    coordinate: load.coordinate || 'global',
    from: finiteOrNull(load.from),
    to: finiteOrNull(load.to),
    t: finiteOrNull(load.t),
    magnitudes: loadMagnitudes(load),
    unit: normalizeUnit(load.unit || ''),
  });
}

function findOppositeDirectionGroups(loads) {
  const groups = new Map();
  for (const load of loads) {
    const vector = directionVector(load);
    if (!vector) continue;
    const orientation = canonicalOrientation(vector);
    const key = stableJson({
      type: load.type,
      case: load.case || null,
      node: load.node || null,
      member: load.member || null,
      range: [finiteOrNull(load.from), finiteOrNull(load.to), finiteOrNull(load.t)],
      magnitudes: absoluteMagnitudes(load),
      axis: orientation.axis,
    });
    if (!groups.has(key)) groups.set(key, { positive: [], negative: [] });
    groups.get(key)[orientation.sign > 0 ? 'positive' : 'negative'].push(load);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.positive.length && group.negative.length)
    .map(([key, group]) => ({ key, items: [...group.positive, ...group.negative] }));
}

function isZeroLoad(load, toleranceInput = 1e-12) {
  const tolerance = Math.max(0, Number(toleranceInput) || 1e-12);
  const magnitudes = Object.values(loadMagnitudes(load));
  return magnitudes.length > 0 && magnitudes.every((value) => Math.abs(value) <= tolerance);
}

function loadMagnitudes(load = {}) {
  const keysByType = {
    nodal: ['P'],
    point: ['P'],
    nmoment: ['M'],
    mmoment: ['M'],
    udl: ['w'],
    'udl-partial': ['w'],
    trapezoid: ['w1', 'w2'],
    temperature: ['dT'],
    tgradient: ['dTtop', 'dTbot'],
  };
  const out = {};
  for (const key of keysByType[load.type] || []) {
    const value = Number(load[key]);
    if (Number.isFinite(value)) out[key] = normalizedNumber(value);
  }
  return out;
}

function absoluteMagnitudes(load) {
  return Object.fromEntries(Object.entries(loadMagnitudes(load)).map(([key, value]) => [key, Math.abs(value)]));
}

function summarizeLoadMagnitudes(loads) {
  const byCase = {};
  for (const load of loads) {
    const caseId = load.case || '(unassigned)';
    if (!byCase[caseId]) byCase[caseId] = { count: 0, magnitudes: {} };
    byCase[caseId].count += 1;
    for (const [key, value] of Object.entries(loadMagnitudes(load))) {
      byCase[caseId].magnitudes[key] = normalizedNumber((byCase[caseId].magnitudes[key] || 0) + value);
    }
  }
  return { byCase };
}

function requiresNode(load) {
  return ['nodal', 'nmoment'].includes(load?.type);
}

function requiresMember(load) {
  return ['udl', 'udl-partial', 'trapezoid', 'point', 'mmoment', 'temperature', 'tgradient'].includes(load?.type);
}

function expectedLoadUnits(type) {
  if (['nodal', 'point'].includes(type)) return ['kn'];
  if (['udl', 'udl-partial', 'trapezoid'].includes(type)) return ['kn/m'];
  if (['nmoment', 'mmoment'].includes(type)) return ['kn*m', 'kn-m'];
  if (['temperature', 'tgradient'].includes(type)) return ['c', 'degc', '°c'];
  return [];
}

function normalizeUnit(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizedDirectionValue(load) {
  const vector = directionVector(load);
  return vector || effectiveDirection(load);
}

function effectiveDirection(load) {
  const dir = String(load?.dir || '').trim().toLowerCase();
  return dir || null;
}

function directionVector(load) {
  if (Array.isArray(load?.direction) && load.direction.length >= 3) {
    const vector = load.direction.slice(0, 3).map(Number);
    if (vector.every(Number.isFinite) && vector.some((value) => Math.abs(value) > 0)) return vector;
  }
  const dir = effectiveDirection(load);
  const vectors = {
    '+x': [1, 0, 0], x: [1, 0, 0], '-x': [-1, 0, 0],
    '+y': [0, 1, 0], y: [0, 1, 0], '-y': [0, -1, 0],
    '+z': [0, 0, 1], z: [0, 0, 1], '-z': [0, 0, -1],
  };
  const base = vectors[dir];
  if (!base) return null;
  const magnitude = primaryMagnitude(load);
  const sign = magnitude < 0 ? -1 : 1;
  return base.map((value) => value * sign);
}

function primaryMagnitude(load) {
  const values = Object.values(loadMagnitudes(load));
  return values.length ? values[0] : 0;
}

function canonicalOrientation(vector) {
  const abs = vector.map(Math.abs);
  const axisIndex = abs.indexOf(Math.max(...abs));
  return { axis: ['x', 'y', 'z'][axisIndex], sign: Math.sign(vector[axisIndex]) || 1 };
}

function auditIssue(code, severity, message, loads, detail = null) {
  const loadIds = loads.map((load) => load?.id || null);
  const targetTokens = loads.flatMap((load) => [load?.node, load?.member]).filter(Boolean);
  const token = [...loadIds, ...targetTokens, detail?.caseId, detail?.combinationId].filter(Boolean).sort().join('|') || 'model';
  return {
    id: `load-audit:${stableToken(code)}:${stableToken(token)}`,
    code,
    severity,
    message,
    loadIds,
    targets: [...new Set(targetTokens)].sort(),
    detail,
  };
}

function groupSummary(group) {
  return {
    key: group.key,
    loadIds: group.items.map((item) => item?.id || null),
    count: group.items.length,
  };
}

function countBy(items, keyOf) {
  const out = {};
  for (const item of items) {
    const key = keyOf(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? normalizedNumber(number) : null;
}

function normalizedNumber(value) {
  return Number(Number(value).toPrecision(12));
}

function stableToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'none';
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
