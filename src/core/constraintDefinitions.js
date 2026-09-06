export const GENERAL_CONSTRAINT_VERSION = 'p10-m5-general-constraint-v1';
export const GENERAL_CONSTRAINT_TYPES = Object.freeze(['mpc', 'rigidLink', 'masterSlave']);
export const GENERAL_CONSTRAINT_DOF_KEYS = Object.freeze(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);

export function normalizeGeneralConstraints(constraints = [], nodes = [], options = {}) {
  const nodeIndex = new Map(nodes.map((node, index) => [String(node.id), index]));
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const fixed = options.fixedDofs instanceof Set ? options.fixedDofs : new Set();
  const errors = [];
  const equations = [];
  const ids = new Set();

  if (!Array.isArray(constraints)) {
    return failed('BAD_CONSTRAINT_COLLECTION', 'constraints must be an array.', 'constraints');
  }
  constraints.forEach((source, index) => {
    const id = String(source?.id || `CONSTRAINT-${index + 1}`);
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(issue('BAD_CONSTRAINT', 'Constraint must be an object.', id));
      return;
    }
    if (ids.has(id)) {
      errors.push(issue('DUPLICATE_CONSTRAINT_ID', `Duplicate constraint id ${id}.`, id));
      return;
    }
    ids.add(id);
    if (!GENERAL_CONSTRAINT_TYPES.includes(source.type)) {
      errors.push(issue('BAD_CONSTRAINT_TYPE', `Constraint ${id} has unsupported type ${source.type}.`, id));
      return;
    }
    if (source.type === 'mpc') {
      const equation = normalizeMpc(source, id, nodeIndex, errors);
      if (equation) equations.push(equation);
      return;
    }
    equations.push(...normalizeRigidConstraint(source, id, nodeIndex, nodeById, errors));
  });

  const slaveOwner = new Map();
  for (const equation of equations) {
    const key = dofKey(equation.slave);
    if (slaveOwner.has(key)) {
      errors.push(issue(
        'CONSTRAINT_SLAVE_REDEFINED',
        `${key} is assigned by both ${slaveOwner.get(key)} and ${equation.constraintId}.`,
        equation.constraintId,
        equation.slave,
      ));
    } else {
      slaveOwner.set(key, equation.constraintId);
    }
    if (fixed.has(equation.slave.fullDof)) {
      errors.push(issue(
        'CONSTRAINT_SUPPORT_CONFLICT',
        `${key} is both a constraint slave and a restrained support DOF.`,
        equation.constraintId,
        equation.slave,
      ));
    }
  }
  errors.push(...cycleIssues(equations));
  const sortedErrors = errors.sort((a, b) => `${a.code}:${a.constraintId}`.localeCompare(`${b.code}:${b.constraintId}`));
  return {
    version: GENERAL_CONSTRAINT_VERSION,
    ok: sortedErrors.length === 0,
    reason: sortedErrors[0]?.code || null,
    equations,
    errors: sortedErrors,
    constraintCount: constraints.length,
    equationCount: equations.length,
  };
}

export function constraintConnectivityGroups(constraints = []) {
  return (Array.isArray(constraints) ? constraints : []).map((constraint) => {
    const ids = new Set();
    if (constraint?.slave?.node != null) ids.add(String(constraint.slave.node));
    if (constraint?.master?.node != null) ids.add(String(constraint.master.node));
    for (const term of constraint?.terms || []) if (term?.node != null) ids.add(String(term.node));
    return [...ids];
  }).filter((ids) => ids.length > 1);
}

function normalizeMpc(source, id, nodeIndex, errors) {
  const slave = endpoint(source.slave, nodeIndex, id, 'slave', errors);
  if (!slave) return null;
  if (!Array.isArray(source.terms) || source.terms.length === 0) {
    errors.push(issue('BAD_CONSTRAINT_TERMS', `MPC ${id} requires at least one term.`, id));
    return null;
  }
  const terms = source.terms.map((term, index) => {
    const target = endpoint(term, nodeIndex, id, `terms[${index}]`, errors);
    if (!target) return null;
    const coefficient = term.c ?? term.coefficient;
    if (typeof coefficient !== 'number' || !Number.isFinite(coefficient)) {
      errors.push(issue('BAD_CONSTRAINT_COEFFICIENT', `MPC ${id} term ${index} coefficient must be finite.`, id));
      return null;
    }
    return { ...target, coefficient };
  }).filter(Boolean);
  const d = source.d ?? 0;
  if (typeof d !== 'number' || !Number.isFinite(d)) {
    errors.push(issue('BAD_CONSTRAINT_OFFSET', `MPC ${id} d must be finite.`, id));
    return null;
  }
  return { constraintId: id, sourceType: 'mpc', slave, terms, d };
}

function normalizeRigidConstraint(source, id, nodeIndex, nodeById, errors) {
  const slaveId = String(source.slave?.node ?? '');
  const masterId = String(source.master?.node ?? '');
  if (!nodeIndex.has(slaveId) || !nodeIndex.has(masterId) || slaveId === masterId) {
    errors.push(issue('BAD_CONSTRAINT_NODE_REF', `Constraint ${id} requires distinct existing master/slave nodes.`, id));
    return [];
  }
  const allowed = source.type === 'rigidLink'
    ? GENERAL_CONSTRAINT_DOF_KEYS
    : normalizeDofSelection(source.dofs ?? source.directions, id, errors);
  if (!allowed.length) return [];
  const master = nodeById.get(masterId);
  const slave = nodeById.get(slaveId);
  const rawOffset = source.offset;
  const offset = rawOffset == null
    ? [Number(slave.x) - Number(master.x), Number(slave.y) - Number(master.y), Number(slave.z || 0) - Number(master.z || 0)]
    : ['dx', 'dy', 'dz'].map((key) => rawOffset?.[key] ?? 0);
  if (offset.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(issue('BAD_CONSTRAINT_OFFSET', `Constraint ${id} offset components must be finite.`, id));
    return [];
  }
  const [rx, ry, rz] = offset;
  const rigidTerms = {
    ux: [['ux', 1], ['ry', rz], ['rz', -ry]],
    uy: [['uy', 1], ['rz', rx], ['rx', -rz]],
    uz: [['uz', 1], ['rx', ry], ['ry', -rx]],
    rx: [['rx', 1]],
    ry: [['ry', 1]],
    rz: [['rz', 1]],
  };
  return allowed.map((dof) => ({
    constraintId: id,
    sourceType: source.type,
    slave: endpoint({ node: slaveId, dof }, nodeIndex, id, 'slave', errors),
    terms: rigidTerms[dof].filter((entry) => entry[1] !== 0).map(([termDof, coefficient]) => ({
      ...endpoint({ node: masterId, dof: termDof }, nodeIndex, id, 'master', errors),
      coefficient,
    })),
    d: 0,
    offset,
  }));
}

function normalizeDofSelection(value, id, errors) {
  if (!Array.isArray(value) || value.length === 0 || value.some((dof) => !GENERAL_CONSTRAINT_DOF_KEYS.includes(dof))) {
    errors.push(issue('BAD_CONSTRAINT_DOF_SELECTION', `masterSlave ${id} requires valid dofs.`, id));
    return [];
  }
  return [...new Set(value)];
}

function endpoint(value, nodeIndex, id, label, errors) {
  const node = String(value?.node ?? '');
  const dof = value?.dof;
  if (!nodeIndex.has(node) || !GENERAL_CONSTRAINT_DOF_KEYS.includes(dof)) {
    errors.push(issue('BAD_CONSTRAINT_DOF_REF', `${id}.${label} must reference an existing node and structural DOF.`, id));
    return null;
  }
  const component = GENERAL_CONSTRAINT_DOF_KEYS.indexOf(dof);
  return { node, dof, component, fullDof: nodeIndex.get(node) * 6 + component };
}

function cycleIssues(equations) {
  const bySlave = new Map(equations.map((equation) => [dofKey(equation.slave), equation]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  function visit(key, trail = []) {
    if (visiting.has(key)) {
      const equation = bySlave.get(key);
      errors.push(issue('CONSTRAINT_CYCLE', `Constraint cycle detected: ${[...trail, key].join(' -> ')}.`, equation?.constraintId || key));
      return;
    }
    if (visited.has(key) || !bySlave.has(key)) return;
    visiting.add(key);
    const equation = bySlave.get(key);
    for (const term of equation.terms) visit(dofKey(term), [...trail, key]);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of bySlave.keys()) visit(key);
  return errors;
}

function dofKey(endpointValue) {
  return `${endpointValue.node}.${endpointValue.dof}`;
}

function issue(code, message, constraintId, location = null) {
  return { code, message, constraintId, location };
}

function failed(code, message, target) {
  return {
    version: GENERAL_CONSTRAINT_VERSION,
    ok: false,
    reason: code,
    equations: [],
    errors: [{ code, message, constraintId: target, location: null }],
    constraintCount: 0,
    equationCount: 0,
  };
}
