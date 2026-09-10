import { reduceConstraintVector } from '../../solver/domain/constraintSystem.js';

// Audit in the original f64 domain. Constraint forces need not vanish at slaves;
// their virtual work must vanish in the independent coordinates.
export function auditConstrainedGpuSolution(request, system, solution) {
  if (!system.constraint) return null;
  const { K, F } = request;
  const { D, x } = solution;
  const c = system.constraint;
  if (!solution.ok || D.length !== K.length || D.some(v => !Number.isFinite(v))) {
    return { ok: false, reason: 'HYBRID_CONSTRAINT_RECOVERY_INVALID' };
  }
  let kinematicError = 0;
  for (let i = 0; i < D.length; i++) {
    let expected = c.prescribed[i];
    for (const [j, coefficient] of c.rows[i]) expected += coefficient * x[j];
    kinematicError = Math.max(kinematicError, Math.abs(D[i] - expected) / Math.max(1, Math.abs(expected)));
  }
  const residual = K.map((row, i) => row.reduce((sum, value, j) => sum + value * D[j], -F[i]));
  const reduced = reduceConstraintVector(c, residual);
  const load = reduceConstraintVector(c, F);
  let virtualWorkResidual = 0;
  for (let i = 0; i < reduced.length; i++) {
    virtualWorkResidual = Math.max(virtualWorkResidual, Math.abs(reduced[i]) / Math.max(1, Math.abs(load[i]), Math.abs(system.Ff[i])));
  }
  const ok = Number.isFinite(virtualWorkResidual) && kinematicError <= 1e-11 && virtualWorkResidual <= 1e-8;
  return { ok, reason: ok ? null : 'HYBRID_CONSTRAINT_F64_AUDIT_FAILED',
    constraintHash: c.hash, fullDofCount: D.length, reducedDofCount: x.length,
    kinematicError, virtualWorkResidual, tolerance: 1e-8,
    equation: 'T^T*(Kt*D-F)=0; D=T*q+lambda*d0', precision: 'f64' };
}
