import { sha256Canonical } from '../../../../framework/phase17/canonical.mjs';

export const P17_SB1_QUALIFICATION_VERSION = 'p17-sb1-qualification-v1';
export const P17_SB1_PRIMARY_REFERENCE = Object.freeze({
  tipUzM: -0.00010786516853932584,
  tipRyRad: 0.00005393258426966292,
  supportRzKn: 1,
  supportMyKnm: -3,
});

const metricContract = Object.freeze([
  ['tipUzM', P17_SB1_PRIMARY_REFERENCE.tipUzM, 0.01],
  ['tipRyRad', P17_SB1_PRIMARY_REFERENCE.tipRyRad, 0.01],
  ['supportRzKn', P17_SB1_PRIMARY_REFERENCE.supportRzKn, 0.01],
  ['supportMyKnm', P17_SB1_PRIMARY_REFERENCE.supportMyKnm, 0.01],
]);

export function qualifyP17M2Sb1(input = {}) {
  const runs = Array.isArray(input.runs) ? input.runs : [];
  const reasons = [];
  if (runs.length !== 3) reasons.push('P17_SB1_THREE_RUNS_REQUIRED');
  const runAudits = runs.map((run, runIndex) => qualifyRun(run, runIndex, reasons));
  const resultHashes = runAudits.map((row) => row.engineeringResultHash).filter(Boolean);
  const deterministic = resultHashes.length === 3 && new Set(resultHashes).size === 1;
  if (!deterministic) reasons.push('P17_SB1_ENGINEERING_RESULT_HASH_NONDETERMINISTIC');
  const mandatoryPass = runAudits.length === 3 && runAudits.every((row) => row.status === 'PASS');
  const core = {
    version: P17_SB1_QUALIFICATION_VERSION,
    caseId: 'SB1',
    status: mandatoryPass && deterministic ? 'PASS' : runs.length ? 'FAIL' : 'PENDING',
    runAudits,
    determinismHashes: resultHashes,
    deterministic,
    reasonCodes: [...new Set(reasons)].sort(),
  };
  return Object.freeze({ ...core, qualificationHash: sha256Canonical(core) });
}

function qualifyRun(run, runIndex, reasons) {
  const meshLevels = Array.isArray(run.meshLevels) ? run.meshLevels : [];
  if (meshLevels.map((row) => row.elements).join(',') !== '1,2,4,8') reasons.push('P17_SB1_MESH_SEQUENCE_INVALID');
  const metricRows = metricContract.map(([metricId, reference, tolerancePct]) => {
    const actual = Number(run.values?.[metricId]);
    const signedErrorPct = Number.isFinite(actual) ? 100 * (actual - reference) / Math.abs(reference) : null;
    const status = Number.isFinite(signedErrorPct) && Math.abs(signedErrorPct) <= tolerancePct ? 'PASS' : 'FAIL';
    if (status !== 'PASS') reasons.push(`P17_SB1_${metricId.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_FAILED`);
    return { metricId, actual, reference, tolerancePct, signedErrorPct, status };
  });
  const meshHashes = meshLevels.map((row) => row.engineeringResultHash);
  const meshValues = meshLevels.map((row) => Number(row.tipUzM));
  const meshInvariant = meshLevels.length === 4
    && meshHashes.every((hash) => /^[a-f0-9]{64}$/u.test(String(hash || '')))
    && meshValues.every(Number.isFinite)
    && Math.max(...meshValues.map((value) => Math.abs(value - P17_SB1_PRIMARY_REFERENCE.tipUzM))) <= 1e-12;
  if (!meshInvariant) reasons.push('P17_SB1_SUBDIVISION_INVARIANCE_FAILED');
  const equilibriumForceResidual = Math.abs(Number(run.values?.supportRzKn) - 1);
  const equilibriumMomentResidual = Math.abs(Number(run.values?.supportMyKnm) + 3);
  const equilibriumPass = equilibriumForceResidual <= 1e-10 && equilibriumMomentResidual <= 1e-10;
  if (!equilibriumPass) reasons.push('P17_SB1_EQUILIBRIUM_FAILED');
  const analyticalEnergyKnm = 0.5 * Math.abs(P17_SB1_PRIMARY_REFERENCE.tipUzM);
  const observedEnergyKnm = Number(run.energy?.strainEnergyKnm);
  const energyResidual = Number.isFinite(observedEnergyKnm)
    ? Math.abs(observedEnergyKnm - analyticalEnergyKnm) / Math.max(analyticalEnergyKnm, 1e-30)
    : Infinity;
  const energyPass = energyResidual <= 1e-8;
  if (!energyPass) reasons.push('P17_SB1_ENERGY_FAILED');
  const reversal = run.mutations?.loadReversal;
  const reversalPass = reversal
    && Math.abs(Number(reversal.tipUzM) + Number(run.values?.tipUzM)) <= 1e-12
    && Math.abs(Number(reversal.supportRzKn) + Number(run.values?.supportRzKn)) <= 1e-10
    && Math.abs(Number(reversal.supportMyKnm) + Number(run.values?.supportMyKnm)) <= 1e-10;
  if (!reversalPass) reasons.push('P17_SB1_LOAD_REVERSAL_MUTATION_SURVIVED');
  const status = metricRows.every((row) => row.status === 'PASS') && meshInvariant && equilibriumPass && energyPass && reversalPass ? 'PASS' : 'FAIL';
  return {
    runIndex: runIndex + 1,
    runId: run.runId || null,
    engineeringResultHash: run.engineeringResultHash || null,
    status,
    metricRows,
    physics: { equilibriumForceResidual, equilibriumMomentResidual, energyResidual, meshInvariant, reversalPass },
  };
}

