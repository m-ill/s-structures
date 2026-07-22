import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  buildMemberReleaseSummary,
  createModel,
  memberRotationalSpringEntries,
  normalizeMemberReleases,
  validateModel,
} from '../src/index.js';
import {
  DOMAIN_BINARY_VERSION,
  packDomainBinary,
  validateDomainBinary,
} from '../src/compute/contracts/domainBinary.js';
import { executeModelingAction } from '../src/ui/indexAgentActions.js';

const valid = schemaModel({ ryI: 0, rzJ: 2500 });
assert.equal(validateModel(valid).ok, true, 'finite nonnegative rotational springs must validate');
assert.deepEqual(
  memberRotationalSpringEntries(valid.members[0]).map(({ key, dof, end, axis, stiffness }) => ({ key, dof, end, axis, stiffness })),
  [
    { key: 'ryI', dof: 4, end: 'i', axis: 'y', stiffness: 0 },
    { key: 'rzJ', dof: 11, end: 'j', axis: 'z', stiffness: 2500 },
  ],
  'canonical keys must retain end/axis/DOF mapping and explicit zero',
);
assert.deepEqual(
  normalizeMemberReleases({ i: 'rigid', j: 'rigid', spring: { ryI: 0, rzJ: 2500 } }),
  { i: 'rigid', j: 'rigid', spring: { ryI: 0, rzJ: 2500 } },
  'normalization must preserve explicit zero rather than treating it as absent',
);

for (const [label, spring] of [
  ['unknown key', { rxI: 10 }],
  ['negative stiffness', { ryI: -1 }],
  ['positive infinity', { ryI: Number.POSITIVE_INFINITY }],
  ['negative infinity', { ryI: Number.NEGATIVE_INFINITY }],
  ['NaN', { ryI: Number.NaN }],
  ['numeric string', { ryI: '10' }],
]) {
  const validation = validateModel(schemaModel(spring));
  assert.equal(validation.ok, false, label);
  assert.ok(
    validation.errors.some((item) => item.code === ERROR_CODES.BAD_RELEASE_SPRING),
    `${label} must fail with BAD_RELEASE_SPRING`,
  );
}

const truss = schemaModel({ rzI: 10 });
truss.members[0].type = 'truss';
assert.ok(
  validateModel(truss).errors.some((item) => item.code === ERROR_CODES.RELEASE_SPRING_FRAME_REQUIRED),
  'rotational springs on axial-only members must fail closed',
);

const sameEndConflict = schemaModel({ rzI: 10 });
sameEndConflict.members[0].releases.i = 'pin';
assert.ok(
  validateModel(sameEndConflict).errors.some((item) => item.code === ERROR_CODES.RELEASE_SPRING_CONFLICT),
  'a binary pin and spring at the same end must conflict',
);

const oppositeEnd = schemaModel({ rzJ: 10 });
oppositeEnd.members[0].releases.i = 'pin';
assert.equal(
  validateModel(oppositeEnd).errors.some((item) => item.code === ERROR_CODES.RELEASE_SPRING_CONFLICT),
  false,
  'a pin at i and spring at j are independent and must be allowed',
);

const absent = schemaModel(null);
const explicitZero = schemaModel({ ryI: 0 });
assert.equal(memberRotationalSpringEntries(absent.members[0]).length, 0);
assert.equal(memberRotationalSpringEntries(explicitZero.members[0]).length, 1);
const absentDomain = packDomainBinary(absent);
const zeroDomain = packDomainBinary(explicitZero);
assert.equal(DOMAIN_BINARY_VERSION, 'p10-domain-binary-v5');
assert.equal(validateDomainBinary(absentDomain).ok, true);
assert.equal(validateDomainBinary(zeroDomain).ok, true);
assert.deepEqual([...absentDomain.buffers.memberRotationalSprings], [0, 0, 0, 0]);
assert.deepEqual([...zeroDomain.buffers.memberRotationalSprings], [0, 0, 0, 0]);
assert.deepEqual([...absentDomain.buffers.memberRotationalSpringMask], [0]);
assert.deepEqual([...zeroDomain.buffers.memberRotationalSpringMask], [1]);
assert.notEqual(absentDomain.domainHash, zeroDomain.domainHash, 'presence mask must distinguish absent rigid from explicit-zero release');

const releaseSummary = buildMemberReleaseSummary(valid);
assert.equal(releaseSummary.partialFixityMemberCount, 1);
assert.equal(releaseSummary.explicitZeroSpringMemberCount, 1);
assert.equal(releaseSummary.connectionModifiedMemberCount, 1);
assert.deepEqual(releaseSummary.springCounts, { total: 2, finite: 1, explicitZero: 1 });
assert.equal(releaseSummary.members[0].partialFixity.enabled, true);
assert.equal(releaseSummary.members[0].partialFixity.explicitZero, true);
assert.deepEqual(
  releaseSummary.members[0].partialFixity.entries.map(({ key, stiffness }) => ({ key, stiffness })),
  [{ key: 'ryI', stiffness: 0 }, { key: 'rzJ', stiffness: 2500 }],
);

const actionModel = schemaModel(null);
executeModelingAction(actionModel, { selection: { type: null, id: null } }, 'updateMember', {
  id: 'M1',
  releases: { i: 'rigid', j: 'rigid', spring: { ryI: 0, rzJ: 2500 } },
});
assert.deepEqual(
  actionModel.members[0].releases.spring,
  { ryI: 0, rzJ: 2500 },
  'agent modeling normalization must preserve rotational springs and explicit zero',
);

const patchModel = schemaModel({ rzJ: 10 });
patchModel.members[0].releases.i = 'pin';
executeModelingAction(patchModel, { selection: { type: null, id: null } }, 'updateMember', {
  id: 'M1',
  releases: { spring: { ryJ: 20 } },
});
assert.deepEqual(
  patchModel.members[0].releases,
  { i: 'pin', j: 'rigid', spring: { rzJ: 10, ryJ: 20 } },
  'partial release patches must preserve existing end releases and rotational spring components',
);

executeModelingAction(patchModel, { selection: { type: null, id: null } }, 'updateMember', {
  id: 'M1',
  releases: { spring: { rzJ: null } },
});
assert.deepEqual(
  patchModel.members[0].releases,
  { i: 'pin', j: 'rigid', spring: { ryJ: 20 } },
  'a null spring component patch must remove only that axis and preserve other releases',
);

assert.throws(
  () => executeModelingAction(patchModel, { selection: { type: null, id: null } }, 'updateMember', {
    id: 'M1',
    releases: { spring: 'invalid' },
  }),
  /rotational springs must be an object/i,
  'non-object spring patches must remain invalid',
);

executeModelingAction(patchModel, { selection: { type: null, id: null } }, 'updateMember', {
  id: 'M1',
  releases: { spring: null },
});
assert.deepEqual(
  patchModel.members[0].releases,
  { i: 'pin', j: 'rigid' },
  'a null spring patch must remove the complete spring map and preserve end releases',
);

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m3-schema-contract',
  explicitZeroMask: zeroDomain.buffers.memberRotationalSpringMask[0],
  absentMask: absentDomain.buffers.memberRotationalSpringMask[0],
}, null, 2));

function schemaModel(spring) {
  const releases = { i: 'rigid', j: 'rigid' };
  if (spring !== null) releases.spring = spring;
  return createModel({
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: 3, y: 0, z: 0, support: null },
    ],
    members: [{
      id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300',
      releases,
    }],
    loads: [],
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: '1.0D', type: 'strength', factors: { D: 1 } }],
  });
}
