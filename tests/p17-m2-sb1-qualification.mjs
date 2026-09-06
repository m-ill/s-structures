import assert from 'node:assert/strict';
import { P17_SB1_PRIMARY_REFERENCE, qualifyP17M2Sb1 } from '../verification/milestones/phase17/m2/framework/sb1Qualification.mjs';
import { sha256Canonical } from '../verification/framework/phase17/canonical.mjs';

const analyticalEnergyKnm = 0.5 * Math.abs(P17_SB1_PRIMARY_REFERENCE.tipUzM);
const runs = [1, 2, 3].map((ordinal) => ({
  runId: `SB1-FIXTURE-${ordinal}`,
  engineeringResultHash: 'a'.repeat(64),
  values: { ...P17_SB1_PRIMARY_REFERENCE },
  energy: { strainEnergyKnm: analyticalEnergyKnm },
  meshLevels: [1, 2, 4, 8].map((elements) => ({ elements, tipUzM: P17_SB1_PRIMARY_REFERENCE.tipUzM, engineeringResultHash: sha256Canonical({ elements, fixture: true }) })),
  mutations: {
    loadReversal: {
      tipUzM: -P17_SB1_PRIMARY_REFERENCE.tipUzM,
      supportRzKn: -P17_SB1_PRIMARY_REFERENCE.supportRzKn,
      supportMyKnm: -P17_SB1_PRIMARY_REFERENCE.supportMyKnm,
    },
  },
}));

const pass = qualifyP17M2Sb1({ runs });
assert.equal(pass.status, 'PASS');
assert.equal(pass.deterministic, true);
assert.equal(pass.runAudits.every((row) => row.status === 'PASS'), true);

const signMutation = structuredClone(runs);
signMutation[0].values.tipUzM *= -1;
const failed = qualifyP17M2Sb1({ runs: signMutation });
assert.equal(failed.status, 'FAIL');
assert.ok(failed.reasonCodes.includes('P17_SB1_TIP_UZ_M_FAILED'));

const missing = qualifyP17M2Sb1({ runs: [] });
assert.equal(missing.status, 'PENDING');
assert.equal(missing.deterministic, false);

console.log(JSON.stringify({
  suite: 'P17-M2 SB1 physics, mutation and determinism contract',
  status: 'PASS',
  syntheticContractOnly: true,
  officialBenchmarkExecuted: false,
  solverExecuted: false,
  metricCount: pass.runAudits[0].metricRows.length,
}, null, 2));
