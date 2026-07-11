import { resolveCriterion } from '../../core/analysisCriteria.js';

export const EQUIVALENT_SHELL_SCOPE_VERSION = 'p6-m6-equivalent-shell-scope-v1';
export const EQUIVALENT_SHELL_WARNING = 'This wall/slab result is based on equivalent frame/link model, not shell FEM.';

export const EQUIVALENT_SHELL_ALLOWED_RESULTS = [
  'preliminary-global-analysis',
  'global-drift-approximation',
  'story-shear-approximation',
  'wall-mid-pier-force-recovery',
  'wall-base-moment-approximation',
  'diaphragm-load-path-preliminary',
];

export const EQUIVALENT_SHELL_FORBIDDEN_RESULTS = [
  'slab-local-bending-stress',
  'wall-opening-local-stress',
  'shell-local-design-force',
  'collector-or-chord-precision-force',
  'punching-shear',
  'mesh-stress-contour',
  'plate-deflection-design-value',
  'slab-strip-design-automation',
];

const FORBIDDEN_FIELD_NAMES = new Set([
  'stress',
  'localStress',
  'shellStress',
  'plateStress',
  'wallOpeningStress',
  'stressContour',
  'meshStressContour',
  'plateDeflection',
  'shellPlateDeflection',
  'wMax',
  'shellForces',
  'plateForces',
  'localPlateForces',
  'collectorForce',
  'chordForce',
  'precisionCollectorForce',
  'precisionChordForce',
  'punchingShear',
  'slabStripDesign',
]);

export function buildEquivalentShellScope(model = {}, options = {}) {
  const counts = countEquivalentShellSources(model);
  const active = options.forceActive === true || Object.values(counts).some((value) => value > 0);
  return {
    version: EQUIVALENT_SHELL_SCOPE_VERSION,
    active,
    badge: active ? 'Equivalent frame/link model' : 'No wall/slab equivalent model',
    warning: EQUIVALENT_SHELL_WARNING,
    modelTreatment: {
      wall: 'mid-pier-equivalent-frame-member',
      slab: 'semi-rigid-diaphragm-or-shell-frame-link-equivalent',
      shell: 'edge-and-diagonal-frame-link-equivalent',
      excluded: 'certified-shell-fem-local-design',
    },
    counts,
    allowedResults: EQUIVALENT_SHELL_ALLOWED_RESULTS.slice(),
    forbiddenResults: EQUIVALENT_SHELL_FORBIDDEN_RESULTS.slice(),
    warnings: active ? [EQUIVALENT_SHELL_WARNING] : [],
    limitations: [
      'Equivalent wall/slab results are valid only for preliminary global behavior review.',
      'Local shell stress, plate deflection design values, punching shear, and collector/chord precision forces are intentionally not reported.',
    ],
  };
}

export function equivalentShellBadge(model = {}, options = {}) {
  const scope = buildEquivalentShellScope(model, options);
  return {
    version: EQUIVALENT_SHELL_SCOPE_VERSION,
    active: scope.active,
    label: scope.badge,
    warning: scope.warning,
  };
}

export function attachEquivalentShellScope(payload = {}, model = {}, options = {}) {
  const scope = buildEquivalentShellScope(model, options);
  return {
    ...payload,
    equivalentShellScope: scope,
    badges: [...(payload.badges || []), equivalentShellBadge(model, { ...options, forceActive: scope.active })],
    warnings: unique([...(payload.warnings || []), ...(scope.active ? scope.warnings : [])]),
    limitations: unique([...(payload.limitations || []), ...scope.limitations]),
  };
}

export function sanitizeEquivalentShellResult(value, options = {}) {
  const removedFields = [];
  const result = sanitizeNode(value, [], removedFields);
  return {
    result,
    removedFields,
    guard: {
      version: EQUIVALENT_SHELL_SCOPE_VERSION,
      status: removedFields.length ? 'forbidden-fields-removed' : 'clean',
      removedFieldCount: removedFields.length,
      removedFields,
      warning: EQUIVALENT_SHELL_WARNING,
      forbiddenResults: options.includeForbiddenResults === false ? [] : EQUIVALENT_SHELL_FORBIDDEN_RESULTS.slice(),
    },
  };
}

export function scanEquivalentShellForbiddenFields(value) {
  const paths = [];
  scanNode(value, [], paths);
  return paths;
}

export function validateEquivalentShellGlobal(reference = {}, computed = {}, modelOrCriteria = {}) {
  const rows = [
    metricRow('globalDrift', valueOf(reference, ['globalDrift', 'drift']), valueOf(computed, ['globalDrift', 'drift']), resolveCriterion(modelOrCriteria, 'equivalentShell.driftErr', 0.1)),
    metricRow('storyShear', valueOf(reference, ['storyShear', 'shear']), valueOf(computed, ['storyShear', 'shear']), resolveCriterion(modelOrCriteria, 'equivalentShell.shearErr', 0.05)),
    metricRow('baseMoment', valueOf(reference, ['baseMoment', 'moment']), valueOf(computed, ['baseMoment', 'moment']), resolveCriterion(modelOrCriteria, 'equivalentShell.momentErr', 0.1)),
  ];
  const activeRows = rows.filter((row) => row.status !== 'not-checked');
  return {
    version: EQUIVALENT_SHELL_SCOPE_VERSION,
    ok: activeRows.length > 0 && activeRows.every((row) => row.status === 'OK'),
    warning: EQUIVALENT_SHELL_WARNING,
    rows,
    summary: {
      checkedCount: activeRows.length,
      passCount: activeRows.filter((row) => row.status === 'OK').length,
      failCount: activeRows.filter((row) => row.status === 'NG').length,
      maxRelativeError: Math.max(0, ...activeRows.map((row) => row.relativeError).filter(Number.isFinite)),
    },
  };
}

function countEquivalentShellSources(model = {}) {
  const shells = model.shells || (model.slabs || []).filter((item) => item.type === 'shell');
  return {
    wallEquivalentCount: (model.wallEquivalents || []).length,
    wallInputCount: (model.walls || []).length,
    shellCount: shells.length,
    slabCount: (model.slabs || []).length,
    semiRigidDiaphragmCount: (model.diaphragms || []).filter((item) => item.type === 'semiRigid').length,
  };
}

function sanitizeNode(value, path, removedFields) {
  if (Array.isArray(value)) return value.map((item, index) => sanitizeNode(item, path.concat(index), removedFields));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const nextPath = path.concat(key);
    if (FORBIDDEN_FIELD_NAMES.has(key)) {
      removedFields.push(nextPath.join('.'));
      continue;
    }
    out[key] = sanitizeNode(item, nextPath, removedFields);
  }
  return out;
}

function scanNode(value, path, paths) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanNode(item, path.concat(index), paths));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const nextPath = path.concat(key);
    if (FORBIDDEN_FIELD_NAMES.has(key)) paths.push(nextPath.join('.'));
    scanNode(item, nextPath, paths);
  }
}

function metricRow(metric, reference, computed, tolerance) {
  const ref = Number(reference);
  const calc = Number(computed);
  if (!Number.isFinite(ref) || !Number.isFinite(calc) || Math.abs(ref) <= 1e-12) {
    return { metric, reference: Number.isFinite(ref) ? ref : null, computed: Number.isFinite(calc) ? calc : null, relativeError: null, tolerance, status: 'not-checked' };
  }
  const relativeError = Math.abs(calc - ref) / Math.abs(ref);
  return {
    metric,
    reference: ref,
    computed: calc,
    absoluteError: Math.abs(calc - ref),
    relativeError,
    tolerance,
    status: relativeError <= tolerance ? 'OK' : 'NG',
  };
}

function valueOf(source, keys) {
  for (const key of keys) {
    if (source?.[key] != null) return source[key];
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
