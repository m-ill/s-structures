export function reducedFixedDofs(fixedDofs, map) {
  return resolveReducedDofConstraints(fixedDofs, map).fixedDofs;
}

export function resolveReducedDofConstraints(fixedDofs, map, valuesByFullDof = new Map()) {
  const tolerance = 1e-12;
  const assigned = new Map();
  const pending = [...fixedDofs]
    .map((fullDof) => ({
      fullDof,
      target: valuesByFullDof.has(fullDof) ? Number(valuesByFullDof.get(fullDof)) : 0,
      terms: (map.rows[fullDof] || []).filter(([, coefficient]) => Math.abs(coefficient) > tolerance),
    }))
    .sort((a, b) => a.fullDof - b.fullDof);
  const resolved = new Set();
  let progress = true;

  while (progress) {
    progress = false;
    for (const equation of pending) {
      if (resolved.has(equation.fullDof)) continue;
      if (!Number.isFinite(equation.target)) {
        return failed('NONFINITE_PRESCRIBED_DISPLACEMENT', equation.fullDof, assigned, pending, resolved);
      }
      let known = 0;
      const unknown = [];
      for (const [column, coefficient] of equation.terms) {
        if (assigned.has(column)) known += coefficient * assigned.get(column);
        else unknown.push([column, coefficient]);
      }
      if (unknown.length > 1) continue;
      if (unknown.length === 1) {
        const [column, coefficient] = unknown[0];
        const value = (equation.target - known) / coefficient;
        if (!Number.isFinite(value)) {
          return failed('NONFINITE_REDUCED_PRESCRIBED_DISPLACEMENT', equation.fullDof, assigned, pending, resolved);
        }
        assigned.set(column, value);
      } else if (!close(known, equation.target)) {
        return failed('INCONSISTENT_PRESCRIBED_DIAPHRAGM_CONSTRAINT', equation.fullDof, assigned, pending, resolved);
      }
      resolved.add(equation.fullDof);
      progress = true;
    }
  }

  const unresolvedFullDofs = pending
    .filter((equation) => !resolved.has(equation.fullDof))
    .map((equation) => equation.fullDof);
  return {
    ok: unresolvedFullDofs.length === 0,
    reason: unresolvedFullDofs.length ? 'UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT' : null,
    fixedDofs: new Set(assigned.keys()),
    values: assigned,
    resolvedFullDofCount: resolved.size,
    unresolvedFullDofs,
  };
}

function failed(reason, fullDof, assigned, pending, resolved) {
  return {
    ok: false,
    reason,
    fullDof,
    fixedDofs: new Set(assigned.keys()),
    values: assigned,
    resolvedFullDofCount: resolved.size,
    unresolvedFullDofs: pending.filter((row) => !resolved.has(row.fullDof)).map((row) => row.fullDof),
  };
}

function close(actual, expected) {
  return Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(actual), Math.abs(expected));
}
