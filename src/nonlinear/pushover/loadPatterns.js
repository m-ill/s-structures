import { stableHash } from '../../core/stableHash.js';
import { buildLoadAudit } from '../../loads/loadAudit.js';
import { buildCanonicalAnalysisDomain } from '../../solver/domain/canonicalDomain.js';
import { constraintRowEntries } from '../../solver/domain/constraintSystem.js';
import { buildNonlinearLoadPattern } from '../equilibrium/externalLoads.js';

export const PUSHOVER_LOAD_PATTERN_VERSION = 'p8-m5-pushover-load-pattern-v1';
export const PUSHOVER_LOAD_SET_VERSION = 'p8-m5-pushover-load-set-v1';
export const PUSHOVER_PATTERN_TYPES = Object.freeze(['uniform', 'triangular', 'modal', 'user']);

const DIRECTIONS = Object.freeze({
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
});

export function resolveGravityCombination(model = {}, combinationId) {
  const id = clean(combinationId);
  if (!id) throw patternError('GRAVITY_COMBINATION_REQUIRED', 'A gravity combination ID is required.');
  const combination = (model.loadCombinations || []).find((row) => String(row.id) === id);
  if (!combination) throw patternError('GRAVITY_COMBINATION_NOT_FOUND', `Gravity combination ${id} was not found.`);
  if (!combination.factors || typeof combination.factors !== 'object' || Array.isArray(combination.factors)) {
    throw patternError('GRAVITY_COMBINATION_FACTORS_INVALID', `Gravity combination ${id} requires factors.`);
  }
  const knownCases = new Set((model.loadCases || []).map((row) => String(row.id)));
  const factors = {};
  for (const [caseId, value] of Object.entries(combination.factors)) {
    const factor = Number(value);
    if (!knownCases.has(caseId)) throw patternError('GRAVITY_COMBINATION_CASE_UNKNOWN', `${id} references unknown load case ${caseId}.`);
    if (!Number.isFinite(factor)) throw patternError('GRAVITY_COMBINATION_FACTOR_NONFINITE', `${id}.${caseId} must be finite.`);
    if (factor !== 0) factors[caseId] = factor;
  }
  if (!Object.keys(factors).length) throw patternError('GRAVITY_COMBINATION_EMPTY', `Gravity combination ${id} has no active factor.`);
  return Object.freeze({
    id: combination.id,
    name: combination.name || combination.id,
    type: combination.type || null,
    purpose: combination.purpose || 'gravity-preload',
    factors: Object.freeze(factors),
    contentHash: stableHash({ id: combination.id, factors }).slice(0, 24),
  });
}

export function buildPushoverLateralPattern(model = {}, options = {}) {
  const type = normalizeType(options.type || options.pattern || 'triangular');
  if (type === 'modal' && !clean(options.modalSourceId)) throw patternError('PUSHOVER_MODAL_SOURCE_REQUIRED', 'Modal pattern requires a verified source ID.');
  if (type === 'user' && !clean(options.userSourceId)) throw patternError('PUSHOVER_USER_SOURCE_REQUIRED', 'User pattern requires a source ID.');
  const direction = normalizeDirection(options.direction || '+x');
  const referenceBaseShear = positive(options.referenceBaseShear, 'referenceBaseShear');
  const nodes = (model.nodes || []).map((node) => ({ ...node })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (!nodes.length) throw patternError('PUSHOVER_PATTERN_NODES_REQUIRED', 'The model has no nodes.');
  const baseElevation = Number.isFinite(Number(options.baseElevation))
    ? Number(options.baseElevation)
    : nodes.reduce((minimum, node) => Math.min(minimum, finite(node.z, 0, `${node.id}.z`)), Infinity);
  const candidates = nodes.filter((node, index) => (
    Number(node.z) > baseElevation + positiveOr(options.elevationTolerance, 1e-9)
    && node.support !== 'fixed'
    && hasActiveDirectionalRow(options.constraint, node.id, index, direction.vector, options.constraintNodeIds)
  ));
  if (!candidates.length) throw patternError('PUSHOVER_PATTERN_ACTIVE_NODES_REQUIRED', 'No lateral pattern node exists above the base elevation.');
  const raw = rawWeights(candidates, type, baseElevation, { ...options, directionVector: direction.vector });
  const signedSum = raw.reduce((sum, row) => sum + row.weight, 0);
  const absoluteSum = raw.reduce((sum, row) => sum + Math.abs(row.weight), 0);
  if (!(absoluteSum > 0) || Math.abs(signedSum) <= 1e-12 * absoluteSum) {
    throw patternError('PUSHOVER_PATTERN_RESULTANT_ZERO', `${type} pattern has zero signed resultant.`);
  }
  const scale = referenceBaseShear / signedSum;
  const caseId = clean(options.caseId) || `PUSH-${direction.id.toUpperCase()}`;
  const loads = raw.map((row, index) => ({
    id: `${caseId}:${String(index + 1).padStart(4, '0')}:${row.nodeId}`,
    type: 'nodal',
    node: row.nodeId,
    P: row.weight * scale,
    direction: direction.vector.slice(),
    coordinate: 'global',
    case: caseId,
    loadRole: 'reference',
    reference: true,
    scaleWithLambda: true,
    source: PUSHOVER_LOAD_PATTERN_VERSION,
    sourcePattern: type,
  }));
  const normalizedResultant = loads.reduce((sum, load) => sum + Number(load.P), 0);
  const storyRows = summarizeStories(candidates, loads, baseElevation);
  const core = {
    version: PUSHOVER_LOAD_PATTERN_VERSION,
    type,
    direction: direction.id,
    directionVector: direction.vector,
    caseId,
    baseElevation,
    referenceBaseShear,
    normalizedResultant,
    rawSignedSum: signedSum,
    rawAbsoluteSum: absoluteSum,
    source: type === 'modal' ? clean(options.modalSourceId) || null : type === 'user' ? clean(options.userSourceId) || null : 'geometry',
    sourceHash: stableHash({
      type,
      sourceId: type === 'modal' ? clean(options.modalSourceId) : type === 'user' ? clean(options.userSourceId) : 'geometry',
      raw,
      nodalMasses: type === 'modal' ? options.nodalMasses || null : null,
    }).slice(0, 24),
    nodes: loads.map((load, index) => ({
      nodeId: load.node,
      elevation: Number(candidates.find((node) => node.id === load.node)?.z || 0),
      rawWeight: raw[index].weight,
      force: load.P,
    })),
    stories: storyRows,
    loads,
  };
  return Object.freeze({ ...core, patternHash: stableHash(core).slice(0, 24) });
}

export function buildPushoverLoadSet(model = {}, analysisCase = {}, options = {}) {
  const gravity = resolveGravityCombination(model, options.gravityCombinationId || analysisCase.inputRefs?.gravityCombinationId);
  const gravityDomain = buildCanonicalAnalysisDomain(model, {
    analysisCase: {
      id: `${analysisCase.id || 'PUSHOVER'}:GRAVITY`,
      kind: 'nonlinearStatic',
      settings: { comboId: gravity.id },
      initialState: { policy: 'zero' },
    },
    factors: gravity.factors,
    strictCapabilities: options.strictCapabilities === true,
  });
  if (!gravityDomain.ok) throw patternError(gravityDomain.reason || 'GRAVITY_DOMAIN_INVALID', 'Unable to build the gravity analysis domain.');
  const lateral = buildPushoverLateralPattern(model, {
    ...options,
    ...(analysisCase.inputRefs?.lateralPattern || {}),
    ...(analysisCase.control?.direction ? { direction: analysisCase.control.direction } : {}),
    constraint: gravityDomain.constraint,
    constraintNodeIds: gravityDomain.nodes.map((node) => node.id),
  });
  const domain = buildCanonicalAnalysisDomain(model, {
    analysisCase,
    factors: gravity.factors,
    extraLoads: lateral.loads,
    strictCapabilities: options.strictCapabilities === true,
  });
  if (!domain.ok) throw patternError(domain.reason || 'PUSHOVER_DOMAIN_INVALID', 'Unable to build the Pushover analysis domain.');
  const gravityLoadPattern = buildNonlinearLoadPattern(gravityDomain, {
    constantLoadIds: gravityDomain.loads.map((load) => load.id),
    referenceLoadIds: [],
    strictRoles: true,
  });
  if (!gravityLoadPattern.ok) throw patternError(gravityLoadPattern.reason || 'GRAVITY_LOAD_PATTERN_INVALID', gravityLoadPattern.message || 'Gravity load assembly failed.');
  const lateralIds = new Set(lateral.loads.map((load) => load.id));
  const constantLoadIds = domain.loads.filter((load) => !lateralIds.has(load.id)).map((load) => load.id);
  const referenceLoadIds = domain.loads.filter((load) => lateralIds.has(load.id)).map((load) => load.id);
  if (referenceLoadIds.length !== lateral.loads.length) {
    throw patternError('PUSHOVER_PATTERN_LOAD_LOSS', 'One or more lateral pattern loads were lost during domain construction.');
  }
  const loadPattern = buildNonlinearLoadPattern(domain, {
    constantLoadIds,
    referenceLoadIds,
    strictRoles: true,
  });
  if (!loadPattern.ok) throw patternError(loadPattern.reason || 'PUSHOVER_LOAD_PATTERN_INVALID', loadPattern.message || 'Load assembly failed.');
  const referenceResultant = directionalResultant(loadPattern.referenceFull, lateral.directionVector, domain.nodes.length);
  if (Math.abs(referenceResultant - lateral.referenceBaseShear) > 1e-9 * Math.max(1, lateral.referenceBaseShear)) {
    throw patternError('PUSHOVER_REFERENCE_SHEAR_MISMATCH', `Reference shear ${referenceResultant} does not match ${lateral.referenceBaseShear}.`);
  }
  const loadAudit = buildLoadAudit(model);
  if (loadAudit.status === 'invalid') {
    const errorCodes = [...new Set((loadAudit.issues || []).filter((row) => row.severity === 'error').map((row) => row.code))];
    throw patternError('PUSHOVER_LOAD_AUDIT_INVALID', `Model load audit contains blocking errors: ${errorCodes.join(', ')}.`);
  }
  const duplicateOwnership = duplicatePhysicalKeys(domain.loads);
  if (duplicateOwnership.length) {
    throw patternError('PUSHOVER_PHYSICAL_LOAD_DUPLICATE', `Duplicate physical load ownership: ${duplicateOwnership.join(', ')}.`);
  }
  const ownership = {
    gravityCombinationId: gravity.id,
    gravityFactorHash: gravity.contentHash,
    constantLoadIds: constantLoadIds.slice().sort(),
    lateralPatternId: lateral.caseId,
    lateralPatternHash: lateral.patternHash,
    referenceLoadIds: referenceLoadIds.slice().sort(),
    selfWeight: model.analysisSettings?.includeSelfWeight === true
      ? { mode: 'solver-generated-once', ids: constantLoadIds.filter((id) => String(id).startsWith('sw_')) }
      : { mode: 'explicit-only', ids: [] },
    duplicatePhysicalLoadCount: 0,
    phase7LoadAuditVersion: loadAudit.version,
    phase7LoadAuditStatus: loadAudit.status,
  };
  const core = {
    version: PUSHOVER_LOAD_SET_VERSION,
    gravity,
    lateral,
    domain,
    gravityDomain,
    gravityLoadPattern,
    loadPattern,
    ownership,
    loadAudit,
    referenceResultant,
  };
  return Object.freeze({ ...core, loadSetHash: stableHash({
    version: core.version,
    domainHash: domain.identity.domainHash,
    gravityDomainHash: gravityDomain.identity.domainHash,
    gravityPatternHash: gravityLoadPattern.patternHash,
    patternHash: loadPattern.patternHash,
    ownership,
  }).slice(0, 24) });
}

export function remapLoadPatternRoles(pattern, role) {
  if (!pattern?.ok || !['constant', 'reference'].includes(role)) {
    throw patternError('PUSHOVER_ROLE_REMAP_INVALID', 'A valid load pattern and target role are required.');
  }
  const fullDofCount = pattern.constantFull.length;
  const reducedDofCount = pattern.constantReduced.length;
  const physicalFull = Float64Array.from(pattern.constantFull, (value, index) => Number(value) + Number(pattern.referenceFull[index]));
  const physicalReduced = Float64Array.from(pattern.constantReduced, (value, index) => Number(value) + Number(pattern.referenceReduced[index]));
  const zeroFull = new Float64Array(fullDofCount);
  const zeroReduced = new Float64Array(reducedDofCount);
  const trace = (pattern.trace || []).map((row) => ({ ...row, role }));
  const core = {
    ...pattern,
    constantFull: role === 'constant' ? physicalFull : zeroFull,
    referenceFull: role === 'reference' ? physicalFull : zeroFull,
    constantReduced: role === 'constant' ? physicalReduced : zeroReduced,
    referenceReduced: role === 'reference' ? physicalReduced : zeroReduced,
    full: role === 'reference' ? physicalFull : zeroFull,
    reduced: role === 'reference' ? physicalReduced : zeroReduced,
    trace,
    constantLoadCount: role === 'constant' ? trace.length : 0,
    referenceLoadCount: role === 'reference' ? trace.length : 0,
  };
  return Object.freeze({ ...core, patternHash: stableHash({
    version: core.version,
    role,
    constantFull: Array.from(core.constantFull),
    referenceFull: Array.from(core.referenceFull),
    trace,
  }).slice(0, 24) });
}

function rawWeights(nodes, type, baseElevation, options) {
  if (type === 'modal') {
    const source = options.modalVector || options.modeShape;
    return nodes.map((node) => ({
      nodeId: node.id,
      weight: sourceValue(source, node.id) * nodeMass(node, options.nodalMasses, options.directionVector),
    }));
  }
  if (type === 'user') {
    const source = options.userPattern || options.userVector;
    return nodes.map((node) => ({ nodeId: node.id, weight: sourceValue(source, node.id) }));
  }
  const stories = groupByElevation(nodes);
  const rows = [];
  for (const story of stories) {
    const storyWeight = type === 'uniform' ? 1 : Math.max(0, story.elevation - baseElevation);
    const perNode = storyWeight / story.nodes.length;
    story.nodes.forEach((node) => rows.push({ nodeId: node.id, weight: perNode }));
  }
  return rows.sort((a, b) => String(a.nodeId).localeCompare(String(b.nodeId)));
}

function sourceValue(source, nodeId) {
  const value = source instanceof Map ? source.get(nodeId) : source?.[nodeId];
  const number = Number(value);
  if (!Number.isFinite(number)) throw patternError('PUSHOVER_PATTERN_SOURCE_MISSING', `Pattern source is missing finite value for node ${nodeId}.`);
  return number;
}

function nodeMass(node, source, direction = [1, 0, 0]) {
  const explicit = source instanceof Map ? source.get(node.id) : source?.[node.id];
  if (Array.isArray(explicit)) return positive(directionalMass(explicit, direction), `${node.id}.mass`);
  if (explicit != null) return positive(explicit, `${node.id}.mass`);
  if (Array.isArray(node.mass)) return positive(directionalMass(node.mass, direction), `${node.id}.mass`);
  return node.mass == null ? 1 : positive(node.mass, `${node.id}.mass`);
}

function directionalMass(mass, direction) {
  return [0, 1, 2].reduce((sum, axis) => sum + Number(mass[axis] || 0) * Number(direction[axis] || 0) ** 2, 0);
}

function hasActiveDirectionalRow(constraint, nodeId, fallbackIndex, direction, constraintNodeIds) {
  if (!constraint?.ok) return true;
  const mapped = Array.isArray(constraintNodeIds) ? constraintNodeIds.findIndex((id) => String(id) === String(nodeId)) : -1;
  const nodeIndex = mapped >= 0 ? mapped : fallbackIndex;
  const reduced = new Float64Array(constraint.reducedDofCount);
  for (let axis = 0; axis < 3; axis += 1) {
    const coefficient = Number(direction[axis] || 0);
    if (coefficient === 0) continue;
    for (const [reducedDof, value] of constraintRowEntries(constraint, nodeIndex * 6 + axis)) {
      reduced[reducedDof] += coefficient * Number(value);
    }
  }
  return reduced.some((value) => Math.abs(value) > 1e-14);
}

function summarizeStories(nodes, loads, baseElevation) {
  const forceByNode = new Map(loads.map((load) => [load.node, Number(load.P)]));
  return groupByElevation(nodes).map((story, index) => ({
    story: index + 1,
    elevation: story.elevation,
    heightAboveBase: story.elevation - baseElevation,
    nodeIds: story.nodes.map((node) => node.id).sort(),
    referenceForce: story.nodes.reduce((sum, node) => sum + Number(forceByNode.get(node.id) || 0), 0),
  }));
}

function groupByElevation(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    const elevation = Number(node.z);
    const key = elevation.toPrecision(14);
    if (!groups.has(key)) groups.set(key, { elevation, nodes: [] });
    groups.get(key).nodes.push(node);
  });
  return [...groups.values()].sort((a, b) => a.elevation - b.elevation);
}

function directionalResultant(full, direction, nodeCount) {
  let total = 0;
  for (let node = 0; node < nodeCount; node += 1) {
    for (let axis = 0; axis < 3; axis += 1) total += Number(full[node * 6 + axis]) * Number(direction[axis]);
  }
  return total;
}

function duplicatePhysicalKeys(loads) {
  const counts = new Map();
  loads.forEach((load) => {
    const key = load.physicalSourceKey || load.generatedKey || load.id;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key).sort();
}

function normalizeType(value) {
  const type = clean(value).toLowerCase();
  if (!PUSHOVER_PATTERN_TYPES.includes(type)) throw patternError('PUSHOVER_PATTERN_TYPE_INVALID', `Unsupported Pushover pattern ${value}.`);
  return type;
}

function normalizeDirection(value) {
  if (Array.isArray(value)) {
    const vector = value.slice(0, 3).map(Number);
    const length = Math.hypot(...vector);
    if (!(length > 0) || vector.some((item) => !Number.isFinite(item))) throw patternError('PUSHOVER_DIRECTION_INVALID', 'Direction must be finite and nonzero.');
    return { id: 'custom', vector: vector.map((item) => item / length) };
  }
  const id = clean(value).toLowerCase();
  if (!DIRECTIONS[id]) throw patternError('PUSHOVER_DIRECTION_INVALID', `Unsupported direction ${value}.`);
  return { id, vector: DIRECTIONS[id].slice() };
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw patternError('PUSHOVER_PATTERN_VALUE_INVALID', `${name} must be positive.`);
  return number;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finite(value, fallback, name) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw patternError('PUSHOVER_PATTERN_VALUE_INVALID', `${name} must be finite.`);
  return number;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function patternError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
