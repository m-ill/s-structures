import { stableHash } from '../../core/stableHash.js';

export const NONLINEAR_INTEGRATION_CAPABILITY_VERSION = 'p8-m9-integration-capability-v1';
export const NONLINEAR_INTEGRATION_MODES = Object.freeze(['static', 'dynamic']);

export function evaluateNonlinearIntegrationCapabilities(input = {}, options = {}) {
  const domain = input?.constraint ? input : options.domain;
  const model = domain?.solverModel || input?.solverModel || input || {};
  const mode = normalizeMode(options.mode || input?.mode || 'static');
  const issues = [];
  const features = featureRows();
  const descriptors = domain?.elements || [];

  for (const descriptor of descriptors) {
    const behavior = descriptor.behavior || descriptor.type || 'frame';
    if (descriptor.partialFixity?.enabled) {
      issues.push(blocking(
        'NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED',
        'member',
        descriptor.id,
        'Rotational connection springs are not yet implemented in the corotational tangent and recovery path.',
      ));
    }
    if (['tensionOnly', 'compressionOnly'].includes(behavior)) {
      issues.push(blocking(
        'NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED',
        'member',
        descriptor.id,
        'Tension-only and compression-only members require an active-set solver that is not yet available.',
      ));
    }
    if (mode === 'dynamic' && (descriptor.releases?.localDofs || []).length) {
      issues.push(blocking(
        'NONLINEAR_DYNAMIC_MEMBER_RELEASE_UNSUPPORTED',
        'member',
        descriptor.id,
        'Member releases are supported for static nonlinear analysis only.',
      ));
    }
    const rigidFactor = Number(descriptor.geometry?.offsets?.rigidFactor ?? 1);
    if (!Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
      issues.push(blocking(
        'NONLINEAR_OFFSET_RIGID_FACTOR_UNSUPPORTED',
        'member',
        descriptor.id,
        'Only fully rigid member end offsets are supported.',
      ));
    }
    if (descriptor.geometry?.offsets?.vector3d === true) {
      issues.push(blocking(
        'NONLINEAR_3D_OFFSET_UNSUPPORTED',
        'member',
        descriptor.id,
        'Three-dimensional rigid-arm offsets require a finite-rotation vector-offset formulation.',
      ));
    }
    if (descriptor.origin?.type === 'shell') {
      issues.push(warning(
        'NONLINEAR_SHELL_EQUIVALENT_ONLY',
        'shell',
        descriptor.origin.id,
        'Shell behavior is represented by preliminary elastic frame links; shell stresses are not recovered.',
      ));
    }
    if (descriptor.origin?.type === 'wall') {
      issues.push(warning(
        'NONLINEAR_WALL_EQUIVALENT_ONLY',
        'wall',
        descriptor.origin.id,
        'Wall behavior is represented by a preliminary mid-pier equivalent member.',
      ));
    }
  }

  for (const member of model.members || []) {
    if (member.releases?.spring && Object.keys(member.releases.spring).length) {
      issues.push(blocking(
        'NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED',
        'member',
        member.id,
        'Rotational connection springs are not yet implemented in the corotational tangent and recovery path.',
      ));
    }
    if (['plate', 'shell', 'solid'].includes(member.type)) {
      issues.push(blocking(
        'NONLINEAR_ELEMENT_TYPE_UNSUPPORTED',
        'member',
        member.id,
        `Element type ${member.type} is outside the production frame scope.`,
      ));
    }
    const rigidFactor = Number(member.endOffset?.rigidFactor ?? member.offsets?.rigidFactor ?? 1);
    if (!Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
      issues.push(blocking(
        'NONLINEAR_OFFSET_RIGID_FACTOR_UNSUPPORTED',
        'member',
        member.id,
        'Only fully rigid member end offsets are supported.',
      ));
    }
    if (hasVectorOffset(member) || (member.insertionPoint != null && member.insertionPoint !== 'centroid')) {
      issues.push(blocking(
        'NONLINEAR_3D_OFFSET_UNSUPPORTED',
        'member',
        member.id,
        'Three-dimensional rigid-arm offsets and non-centroid insertion points are not yet supported by nonlinear analysis.',
      ));
    }
  }

  for (const load of domain?.loads || model.loads || []) {
    if (load.follower === true || load.type === 'follower') {
      issues.push(blocking(
        'NONLINEAR_FOLLOWER_LOAD_UNSUPPORTED',
        'load',
        load.id,
        'Follower loads are not supported by the current tangent formulation.',
      ));
    }
  }

  for (const node of domain?.nodes || model.nodes || []) {
    if (node.support !== 'spring') continue;
    const stiffness = node.spring || {};
    const settlement = node.settlement || {};
    for (const [index, key] of STIFFNESS_KEYS.entries()) {
      const value = Number(stiffness[key] || 0);
      if (!Number.isFinite(value) || value < 0) {
        issues.push(blocking(
          'NONLINEAR_SUPPORT_SPRING_INVALID',
          'node',
          node.id,
          `${key} must be a finite nonnegative stiffness.`,
        ));
      }
      const imposed = settlement[key] ?? settlement[DISPLACEMENT_KEYS[index]];
      if (imposed != null && (!Number.isFinite(Number(imposed)) || value <= 0)) {
        issues.push(blocking(
          'NONLINEAR_SUPPORT_SETTLEMENT_INVALID',
          'node',
          node.id,
          `Settlement ${DISPLACEMENT_KEYS[index]} requires a positive ${key} stiffness and a finite value.`,
        ));
      }
      if (mode === 'dynamic' && isTimeVarying(imposed)) {
        issues.push(blocking(
          'NONLINEAR_DYNAMIC_SUPPORT_MOTION_UNSUPPORTED',
          'node',
          node.id,
          'Time-varying or spatially varying support motion is not supported by the current NLTH solver.',
        ));
      }
    }
  }

  const uniqueIssues = deduplicateIssues(issues);
  const blockingIssues = uniqueIssues.filter((item) => item.severity === 'blocking');
  const warnings = uniqueIssues.filter((item) => item.severity === 'warning');
  const result = {
    version: NONLINEAR_INTEGRATION_CAPABILITY_VERSION,
    ok: blockingIssues.length === 0,
    mode,
    scope: 'canonical-frame-nonlinear-integration',
    domainIdentityHash: domain?.identity?.identityHash || null,
    features,
    issues: uniqueIssues,
    blocking: blockingIssues,
    warnings,
  };
  result.capabilityHash = stableHash(result).slice(0, 24);
  return deepFreeze(result);
}

function hasVectorOffset(member = {}) {
  return ['i', 'j'].some((end) => member.endOffset?.[end] != null && typeof member.endOffset[end] === 'object');
}

export function requireNonlinearIntegrationCapabilities(input = {}, options = {}) {
  const capability = evaluateNonlinearIntegrationCapabilities(input, options);
  if (capability.ok) return capability;
  const error = new Error(capability.blocking[0]?.message || 'Nonlinear integration capability preflight failed.');
  error.code = capability.blocking[0]?.code || 'NONLINEAR_INTEGRATION_UNSUPPORTED';
  error.details = capability;
  throw error;
}

function featureRows() {
  return [
    row('rigid-diaphragm', true, true, 'canonical constraint transformation'),
    row('semi-rigid-diaphragm', true, true, 'massless generated elastic links'),
    row('rigid-end-offset', true, true, 'fully rigid offset transformation'),
    row('local-axis', true, true, 'canonical member axes'),
    row('nodal-member-gravity-loads', true, true, 'consistent load assembly'),
    row('linear-support-spring', true, true, 'six-DOF tangent and reaction recovery'),
    row('constant-support-settlement', true, true, 'spring reference or affine constraint'),
    row('member-release', true, false, 'static condensation and released-force audit'),
    row('member-partial-fixity', false, false, 'corotational spring tangent and recovery required'),
    row('truss', true, true, 'axial-only corotational kernel'),
    row('unilateral-member', false, false, 'active-set solver required'),
    row('wall-shell-equivalent', true, true, 'preliminary elastic equivalent only'),
    row('follower-load', false, false, 'consistent follower tangent unavailable'),
    row('multi-support-dynamic-motion', false, false, 'single uniform ground-motion input only'),
  ];
}

function row(id, staticSupported, dynamicSupported, qualification) {
  return Object.freeze({ id, static: staticSupported, dynamic: dynamicSupported, qualification });
}

function blocking(code, entityType, entityId, message) {
  return issue('blocking', code, entityType, entityId, message);
}

function warning(code, entityType, entityId, message) {
  return issue('warning', code, entityType, entityId, message);
}

function issue(severity, code, entityType, entityId, message) {
  return { severity, code, entityType, entityId: entityId || null, message };
}

function deduplicateIssues(issues) {
  const map = new Map();
  for (const item of issues) map.set(`${item.severity}:${item.code}:${item.entityType}:${item.entityId || ''}`, item);
  return [...map.values()].sort((a, b) => (
    `${a.severity}:${a.code}:${a.entityType}:${a.entityId || ''}`
      .localeCompare(`${b.severity}:${b.code}:${b.entityType}:${b.entityId || ''}`)
  ));
}

function normalizeMode(value) {
  const mode = String(value || '').toLowerCase();
  if (!NONLINEAR_INTEGRATION_MODES.includes(mode)) {
    const error = new TypeError(`Unsupported nonlinear integration mode: ${value}`);
    error.code = 'NONLINEAR_INTEGRATION_MODE_INVALID';
    throw error;
  }
  return mode;
}

function isTimeVarying(value) {
  return Array.isArray(value) || (value && typeof value === 'object') || typeof value === 'function';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const STIFFNESS_KEYS = Object.freeze(['kx', 'ky', 'kz', 'krx', 'kry', 'krz']);
const DISPLACEMENT_KEYS = Object.freeze(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);
