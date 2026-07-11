import assert from 'node:assert/strict';
import { buildAnalysisAudit } from '../src/solver/analysisAudit.js';
import { analyzeModel } from '../src/solver/linear3d.js';
import { makeEnvelope } from '../src/solver/linear3dPost.js';

const combos = [
  { id: 'OK', name: 'Solved', type: 'strength', factors: { D: 1 } },
  { id: 'FAILED', name: 'Failed', type: 'strength', factors: { D: 1, L: 1 } },
];
const solved = solvedResult();
const failed = {
  ok: false,
  anyOk: false,
  reason: 'SINGULAR',
  reactions: {},
  disp: {},
  memberResults: {},
  unstableMembers: new Set(['M2']),
  summary: { equilibriumStatus: 'NOT_AVAILABLE', equilibriumResidual: null },
};

const envelope = makeEnvelope({ OK: solved, FAILED: failed }, combos);
assert.equal(envelope.ok, false);
assert.equal(envelope.anyOk, true);
assert.equal(envelope.complete, false);
assert.equal(envelope.incomplete, true);
assert.equal(envelope.designBlocked, true);
assert.equal(envelope.requestedComboCount, 2);
assert.equal(envelope.successfulComboCount, 1);
assert.equal(envelope.failedComboCount, 1);
assert.deepEqual(envelope.requestedSources.map((combo) => combo.id), ['OK', 'FAILED']);
assert.deepEqual(envelope.successfulSources.map((combo) => combo.id), ['OK']);
assert.deepEqual(envelope.failedSources.map((combo) => combo.id), ['FAILED']);
assert.equal(envelope.failedSources[0].status, 'NOT_SOLVED');
assert.equal(envelope.failedSources[0].reason, 'SINGULAR');
assert.deepEqual(envelope.failedSources[0].factors, { D: 1, L: 1 });
assert.deepEqual(envelope.combinationStatus.map((row) => row.status), ['SOLVED', 'NOT_SOLVED']);

const mixedAudit = buildAnalysisAudit({ ok: false, byCombo: { OK: solved, FAILED: failed } });
assert.equal(mixedAudit.ok, false);
assert.equal(mixedAudit.designBlocked, true);
assert.equal(mixedAudit.notSolvedComboCount, 1);
assert.equal(mixedAudit.blockedComboCount, 1);
assert.equal(row(mixedAudit, 'FAILED').equilibriumStatus, 'NOT_SOLVED');
assert.ok(mixedAudit.warnings.some((warning) => warning.code === 'COMBINATION_NOT_SOLVED' && warning.comboId === 'FAILED'));

const unavailable = solvedResult({
  summary: {
    equilibriumStatus: 'NOT_AVAILABLE',
    equilibriumResidual: null,
    forceResidualNorm: null,
    momentResidualNorm: null,
    totalLoadResultant: null,
    totalReactionResultant: null,
    residualResultant: null,
  },
});
const unavailableAudit = buildAnalysisAudit({ ok: true, byCombo: { NA: unavailable } });
assert.equal(unavailableAudit.ok, false);
assert.equal(unavailableAudit.unavailableEquilibriumComboCount, 1);
assert.equal(row(unavailableAudit, 'NA').equilibriumStatus, 'NOT_AVAILABLE');
assert.ok(unavailableAudit.warnings.some((warning) => warning.code === 'EQUILIBRIUM_NOT_AVAILABLE'));

const nonfinite = solvedResult({
  reactions: { A: { rx: Number.POSITIVE_INFINITY, ry: 0, rz: 0, rmx: 0, rmy: 0, rmz: 0 } },
  summary: {
    equilibriumStatus: 'PASS',
    equilibriumResidual: 0,
    forceResidualNorm: 0,
    momentResidualNorm: 0,
    totalLoadResultant: [0, 0, 0, 0, 0, 0],
    totalReactionResultant: [Number.POSITIVE_INFINITY, 0, 0, 0, 0, 0],
    residualResultant: [Number.POSITIVE_INFINITY, 0, 0, 0, 0, 0],
  },
});
const nonfiniteEnvelope = makeEnvelope({ BAD: nonfinite }, [{ id: 'BAD', factors: { D: 1 } }]);
assert.equal(nonfiniteEnvelope.anyOk, false);
assert.equal(nonfiniteEnvelope.designBlocked, true);
assert.equal(nonfiniteEnvelope.failedSources[0].reason, 'NONFINITE_REACTION_COMPONENT');
assert.deepEqual(nonfiniteEnvelope.reactions, {});

const nonfiniteAudit = buildAnalysisAudit({ ok: true, byCombo: { BAD: nonfinite } });
assert.equal(nonfiniteAudit.ok, false);
assert.equal(row(nonfiniteAudit, 'BAD').equilibriumStatus, 'NOT_AVAILABLE');
assert.ok(row(nonfiniteAudit, 'BAD').nonfiniteIssues.length >= 1);
assert.ok(nonfiniteAudit.warnings.some((warning) => warning.code === 'NONFINITE_EQUILIBRIUM_RESULTANT'));

const actual = analyzeModel(mixedSuccessModel());
assert.equal(actual.ok, false);
assert.deepEqual(Object.keys(actual.byCombo), ['GOOD', 'BAD']);
assert.equal(actual.byCombo.GOOD.ok, true);
assert.equal(actual.byCombo.BAD.ok, false);
assert.equal(actual.envelope.anyOk, true);
assert.equal(actual.envelope.complete, false);
assert.equal(actual.envelope.designBlocked, true);
assert.deepEqual(actual.envelope.sources.map((combo) => combo.id), ['GOOD']);
assert.deepEqual(actual.envelope.requestedSources.map((combo) => combo.id), ['GOOD', 'BAD']);
assert.deepEqual(actual.envelope.failedSources.map((combo) => combo.id), ['BAD']);
assert.equal(actual.audit.rows.find((item) => item.comboId === 'BAD').equilibriumStatus, 'NOT_SOLVED');

console.log(JSON.stringify({
  ok: true,
  version: 'p7-m7-mixed-combo-audit-v1',
  envelopeStatus: envelope.status,
  auditStatuses: mixedAudit.rows.map((item) => item.equilibriumStatus),
  actualFailedReason: actual.byCombo.BAD.reason,
}, null, 2));

function solvedResult(overrides = {}) {
  return {
    ok: true,
    anyOk: true,
    dmax: 0,
    maxRatio: 0,
    disp: { A: [0, 0, 0, 0, 0, 0] },
    reactions: { A: { rx: 0, ry: 0, rz: 0, rmx: 0, rmy: 0, rmz: 0 } },
    memberResults: {},
    unstableMembers: new Set(),
    summary: {
      equilibriumStatus: 'PASS',
      equilibriumResidual: 0,
      forceResidualNorm: 0,
      momentResidualNorm: 0,
      totalLoadResultant: [0, 0, 0, 0, 0, 0],
      totalReactionResultant: [0, 0, 0, 0, 0, 0],
      residualResultant: [0, 0, 0, 0, 0, 0],
    },
    ...overrides,
  };
}

function row(audit, comboId) {
  return audit.rows.find((item) => item.comboId === comboId);
}

function mixedSuccessModel() {
  return {
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 4, y: 0, z: 0, support: 'fixed' },
    ],
    members: [{ id: 'M1', n1: 'A', n2: 'B', matId: 'MAT', secId: 'SEC' }],
    materials: [{
      id: 'MAT', E: 200000, G: 80000, Fy: 1e9,
      allow: { fb: 1e9, ft: 1e9, fc: 1e9, fv: 1e9 },
    }],
    sections: [{ id: 'SEC', type: 'direct', A: 1, Iy: 0.01, Iz: 0.02, J: 0.005, Zy: 1, Zz: 1 }],
    loads: [
      { id: 'P', type: 'nodal', node: 'B', P: 2, dir: '-z', case: 'D' },
      { id: 'INVALID_LOCAL', type: 'udl', member: 'M1', w: 3, dir: '-z', coordinate: 'unsupported', case: 'X' },
    ],
    loadCases: [{ id: 'D', type: 'dead' }, { id: 'X', type: 'other' }],
    loadCombinations: [
      { id: 'GOOD', factors: { D: 1 } },
      { id: 'BAD', factors: { D: 1, X: 1 } },
    ],
    analysisSettings: { validateBeforeSolve: false, responseSpectrum: { enabled: false } },
  };
}
