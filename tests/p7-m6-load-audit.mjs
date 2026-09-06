import assert from 'node:assert/strict';
import {
  LOAD_AUDIT_CODES,
  LOAD_AUDIT_VERSION,
  buildLoadAudit,
} from '../src/index.js';

const model = {
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2' }],
  loadCases: [
    { id: 'D-SW', name: 'Self weight', type: 'dead', family: 'D', variant: 'selfWeight' },
    { id: 'D-SDL', name: 'SDL', type: 'dead', family: 'D', variant: 'superimposed' },
    { id: 'L', name: 'Live', type: 'live', family: 'L' },
  ],
  loadCombinations: [
    { id: 'C1', type: 'strength', factors: { 'D-SW': 1, 'D-SDL': 1, MISSING: 1 } },
  ],
  analysisSettings: { includeSelfWeight: true },
  loads: [
    { id: 'DUP-ID', type: 'udl', member: 'M1', case: 'D-SW', w: 2, dir: '-z', unit: 'kN/m', generatedKey: 'sw:m1' },
    { id: 'DUP-ID', type: 'udl', member: 'M1', case: 'D-SDL', w: 3, dir: '-z', unit: 'kN/m' },
    { id: 'COPY-A', type: 'nodal', node: 'N1', case: 'L', P: 5, dir: '+x', unit: 'kN' },
    { id: 'COPY-B', type: 'nodal', node: 'N1', case: 'L', P: 5, dir: '+x', unit: 'kN' },
    { id: 'ZERO', type: 'nodal', node: 'N2', case: 'L', P: 0, dir: '+y', unit: 'kN' },
    { id: 'ORPHAN', type: 'nodal', node: 'N404', case: 'NO-CASE', P: 4, dir: '+x', unit: 'kN' },
    { id: 'KEY-A', type: 'nodal', node: 'N1', case: 'L', P: 2, dir: '+y', unit: 'kN', generatedKey: 'same:key' },
    { id: 'KEY-B', type: 'nodal', node: 'N1', case: 'L', P: 3, dir: '+y', unit: 'kN', generatedKey: 'same:key', userModified: true },
    { id: 'BAD-UNIT', type: 'udl', member: 'M1', case: 'D-SDL', w: 1, dir: '-z', unit: 'kN' },
    { id: 'OPP-P', type: 'nodal', node: 'N2', case: 'L', P: 7, dir: '+x', unit: 'kN' },
    { id: 'OPP-N', type: 'nodal', node: 'N2', case: 'L', P: 7, dir: '-x', unit: 'kN' },
  ],
};

const before = structuredClone(model);
const audit = buildLoadAudit(model);
assert.equal(audit.version, LOAD_AUDIT_VERSION);
assert.deepEqual(model, before, 'load audit must not mutate the model');
assert.equal(audit.status, 'invalid');

for (const code of [
  LOAD_AUDIT_CODES.DUPLICATE_ID,
  LOAD_AUDIT_CODES.DUPLICATE_CONTENT,
  LOAD_AUDIT_CODES.GENERATED_KEY_CONFLICT,
  LOAD_AUDIT_CODES.ZERO_LOAD,
  LOAD_AUDIT_CODES.ORPHAN_CASE,
  LOAD_AUDIT_CODES.ORPHAN_NODE,
  LOAD_AUDIT_CODES.ORPHAN_COMBINATION_CASE,
  LOAD_AUDIT_CODES.UNIT_MISMATCH,
  LOAD_AUDIT_CODES.OPPOSITE_DIRECTION,
  LOAD_AUDIT_CODES.DOUBLE_SELF_WEIGHT,
]) {
  assert.ok(audit.byCode[code].length > 0, `${code} should be detected`);
}

assert.equal(audit.summary.duplicateIdGroupCount, 1);
assert.equal(audit.summary.zeroLoadCount, 1);
assert.equal(audit.summary.generatedKeyConflictCount, 1);
assert.ok(audit.selfWeightCandidates.some((item) => item.memberId === 'M1' && item.explicitSelfWeight));
assert.ok(audit.generatedKeyConflicts[0].detail.userModified);
assert.deepEqual(buildLoadAudit(model), audit, 'audit output should be deterministic');

console.log(JSON.stringify({
  ok: true,
  version: LOAD_AUDIT_VERSION,
  issues: audit.summary.issueCount,
  duplicateGroups: audit.summary.duplicateIdGroupCount + audit.summary.duplicateContentGroupCount,
  selfWeightCandidates: audit.summary.doubleSelfWeightCandidateCount,
}, null, 2));
