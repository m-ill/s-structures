export const MASS_6DOF_COMPONENTS = Object.freeze(['mx', 'my', 'mz', 'jx', 'jy', 'jz']);

export function normalizeNodeMass6Dof(value, options = {}) {
  const label = options.label || 'node.mass';
  if (value == null) return [0, 0, 0, 0, 0, 0];
  if (!Array.isArray(value)) {
    const scalar = nonnegative(value, label);
    return [scalar, scalar, scalar, 0, 0, 0];
  }
  if (![3, 6].includes(value.length)) {
    throw massError('NODE_MASS_COMPONENT_COUNT_INVALID', `${label} must contain either 3 translational or 6 translational/rotational components.`);
  }
  return Array.from({ length: 6 }, (_item, index) => nonnegative(value[index] ?? 0, `${label}[${index}]`));
}

export function validateNodeMass6Dof(value, options = {}) {
  try {
    normalizeNodeMass6Dof(value, options);
    return { ok: true, code: null, message: null };
  } catch (error) {
    return { ok: false, code: error.code || 'NODE_MASS_COMPONENT_INVALID', message: error.message };
  }
}

function nonnegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw massError('NODE_MASS_COMPONENT_INVALID', `${label} must be finite and nonnegative.`);
  }
  return number;
}

function massError(code, message) {
  return Object.assign(new Error(message), { code });
}
