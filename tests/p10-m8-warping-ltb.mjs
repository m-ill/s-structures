import assert from 'node:assert/strict';
import {
  calculateElasticCriticalMoment,
  checkSteelFlexureLtb,
  checkSteelMember,
  defaultAnalysisCriteria,
  resolveAnalysisCriteria,
  STEEL_FLEXURE_LTB_VERSION,
} from '../src/index.js';
import { stableHash } from '../src/core/stableHash.js';

const input = {
  E: 200e9,
  G: 76.923e9,
  Iz: 8e-6,
  J: 2e-7,
  Cw: 3e-5,
  Lb: 4,
  C1: 1,
  k: 1,
  kw: 1,
};
const expectedMcr = 1915208.8411872974;
const solved = calculateElasticCriticalMoment(input);
assert.equal(solved.ok, true);
const closedFormError = relativeError(solved.Mcr, expectedMcr);
assert.ok(closedFormError < 1e-6, `EL-W01 closed-form error ${closedFormError}`);

const gradient = calculateElasticCriticalMoment({ ...input, C1: 1.25 });
const c1Error = relativeError(gradient.Mcr / solved.Mcr, 1.25);
assert.ok(c1Error < 1e-12, `C1 scaling error ${c1Error}`);

const check = checkSteelFlexureLtb({
  memberId: 'B1',
  material: { E: input.E, G: input.G },
  section: { Iy: 2e-5, Iz: input.Iz, J: input.J, Cw: input.Cw },
  length: input.Lb,
  Lb: input.Lb,
  C1: input.C1,
  demandMoment: expectedMcr * 0.75,
  comboId: 'ULS-1',
});
assert.equal(check.version, STEEL_FLEXURE_LTB_VERSION);
assert.equal(check.type, 'design-check-not-analysis-result');
assert.equal(check.analysisDofChanged, false);
assert.equal(check.governingCombinationId, 'ULS-1');
assert.equal(check.status, 'OK');
assert.ok(Math.abs(check.ratio - 0.75) < 1e-12);
assert.ok(check.limitations.some((row) => row.includes('six DOF')));

const memberCheck = checkSteelMember(
  { id: 'B1', matId: 'S', secId: 'H' },
  {
    L: 4, Nmax: 0, Vymax: 0, Vzmax: 0, Mymax: 0, Mzmax: expectedMcr * 0.75, dmaxM: 0,
    governing: { utilization: { comboId: 'ULS-1', x: 2 } },
  },
  { A: 0.02, Iy: 2e-5, Iz: input.Iz, J: input.J, Cw: input.Cw, Zy: 0.001, Zz: 0.002, ry: 0.05, rz: 0.03 },
  { E: input.E, G: input.G, fa: 250e6, fb: 250e6, fs: 140e6 },
  { global: { warnAtRatio: 0.7, defaultLbZ: 4, ltbC1Default: 1 } },
  { combo: { id: 'ULS-1' } },
  { ltbCriteria: { c1Default: 1 } },
);
assert.equal(memberCheck.ltb.ok, true);
assert.equal(memberCheck.ltb.provenance.sectionCwConsumed, true);
assert.ok(memberCheck.checks.some((row) => row.id === 'steel-ltb-mcr'));
assert.equal(memberCheck.comboId, 'ULS-1');

const blocked = checkSteelFlexureLtb({
  memberId: 'BAD', material: { E: input.E }, section: { Iz: input.Iz, J: input.J, Cw: input.Cw }, length: 4,
});
assert.equal(blocked.status, 'BLOCKED');
assert.ok(blocked.inputReview.missing.includes('G'));

const criteria = resolveAnalysisCriteria(defaultAnalysisCriteria());
assert.equal(criteria.criteria.ltb.c1Default, 1);
assert.equal(criteria.criteria.ltb.closedFormTol, 1e-6);

export const M8_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m8-warping-ltb-v1',
  solverVersion: STEEL_FLEXURE_LTB_VERSION,
  metrics: { closedFormError, c1Error, integratedRatioError: Math.abs(memberCheck.ltb.ratio - 0.75) },
  tolerances: { closedForm: 1e-6, c1: 1e-12, integratedRatio: 1e-12 },
  modelHash: stableHash(input).slice(0, 24),
  contracts: { analysisDofChanged: false, option: 'B-design-check', criteriaC1Default: criteria.criteria.ltb.c1Default },
});

console.log(JSON.stringify(M8_VERIFICATION_SNAPSHOT, null, 2));

function relativeError(actual, expected) { return Math.abs(actual - expected) / Math.max(1, Math.abs(expected)); }
