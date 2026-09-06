export const SUPPORT_CONSTRAINT_VERSION = 'p8-m1-support-constraint-v1';
export const STRUCTURAL_DOF_KEYS = Object.freeze(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);
export const LEGACY_SETTLEMENT_KEYS = Object.freeze(['kx', 'ky', 'kz', 'krx', 'kry', 'krz']);

export function buildFixedDofs(nodes = []) {
  const fixedDofs = new Set();
  nodes.forEach((node, nodeIndex) => {
    const base = nodeIndex * 6;
    if (node.support === 'fixed') {
      for (let component = 0; component < 6; component += 1) fixedDofs.add(base + component);
    } else if (node.support === 'pin') {
      fixedDofs.add(base);
      fixedDofs.add(base + 1);
      fixedDofs.add(base + 2);
    } else if (node.support === 'roller') {
      fixedDofs.add(base + 2);
    } else if (node.support === 'custom' && Array.isArray(node.fix)) {
      node.fix.slice(0, 6).forEach((isFixed, component) => {
        if (isFixed) fixedDofs.add(base + component);
      });
    }
  });
  return fixedDofs;
}

export function collectPrescribedDofs(nodes = [], fixedDofs = buildFixedDofs(nodes)) {
  const entries = [];
  const errors = [];
  nodes.forEach((node, nodeIndex) => {
    const explicit = record(node.prescribedDisplacement)
      ? node.prescribedDisplacement
      : record(node.prescribed) ? node.prescribed : null;
    const settlement = node.support === 'spring' ? null : (record(node.settlement) ? node.settlement : null);
    const source = explicit || settlement;
    if (!source) return;
    STRUCTURAL_DOF_KEYS.forEach((key, component) => {
      const legacyKey = LEGACY_SETTLEMENT_KEYS[component];
      if (!Object.hasOwn(source, key) && !Object.hasOwn(source, legacyKey)) return;
      const fullDof = nodeIndex * 6 + component;
      const value = Number(source[key] ?? source[legacyKey]);
      if (!Number.isFinite(value)) {
        errors.push(issue('NONFINITE_PRESCRIBED_DISPLACEMENT', node.id, key, source[key] ?? source[legacyKey]));
        return;
      }
      if (!explicit && !fixedDofs.has(fullDof)) {
        errors.push(issue('PRESCRIBED_DISPLACEMENT_DOF_NOT_RESTRAINED', node.id, key, value));
        return;
      }
      fixedDofs.add(fullDof);
      entries.push({ nodeId: node.id, component: key, fullDof, value, source: explicit ? 'prescribed' : 'settlement' });
    });
  });
  entries.sort((a, b) => a.fullDof - b.fullDof);
  return { ok: errors.length === 0, entries, errors };
}

function issue(code, nodeId, component, value) {
  return {
    code,
    nodeId,
    component,
    value,
    message: `${nodeId}.${component} has invalid prescribed displacement data.`,
  };
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
