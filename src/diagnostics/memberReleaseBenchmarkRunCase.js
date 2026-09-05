import { createFixedFixedUdl } from '../examples/verification.js';
import { analyzeModel } from '../solver/linear3d.js';

export function runMemberReleaseBenchmarkCase([id, releases, zeroDofs]) {
  const fixture = createFixedFixedUdl();
  fixture.model.members[0].releases = releases;
  const analysis = analyzeModel(fixture.model);
  const end = analysis.byCombo?.D_ONLY?.memberResults?.M1?.end || [];
  const maxReleasedMoment = Math.max(...zeroDofs.map((dof) => Math.abs(end[dof] || 0)));
  const residual = analysis.audit?.maxEquilibriumResidual ?? null;
  return {
    id,
    releases,
    zeroDofs,
    maxReleasedMoment,
    residual,
    status: isOk(analysis, maxReleasedMoment, residual) ? 'OK' : 'NG',
  };
}

function isOk(analysis, moment, residual) {
  return analysis.ok && moment <= 1e-8 && (residual == null || residual <= 1e-8);
}
