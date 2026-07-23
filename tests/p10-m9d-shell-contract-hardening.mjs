import assert from 'node:assert/strict';
import {
  buildShellSoaBatch,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from '../src/index.js';

const nodes = [
  { id: 'N1', x: 0, y: 0, z: 0 },
  { id: 'N2', x: 2, y: 0, z: 0 },
  { id: 'N3', x: 2, y: 2, z: 0 },
  { id: 'N4', x: 0, y: 2, z: 0 },
];
const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
const element = {
  id: 'S1',
  nodes,
  nodeIds: nodes.map((node) => node.id),
  formulation: 'shell',
  material: { E: 30e9, nu: 0.2, density: 2400 },
  t: 0.1,
};

assert.equal(buildShellSoaBatch([], nodeIndex).reason, 'SHELL_BATCH_EMPTY');
assert.equal(buildShellSoaBatch([{ ...element, formulation: 'invented' }], nodeIndex).reason, 'SHELL_FORMULATION_UNSUPPORTED');
assert.equal(buildShellSoaBatch([element], new Map([...nodeIndex].filter(([id]) => id !== 'N4'))).reason, 'SHELL_NODE_INDEX_MISSING');
assert.equal(buildShellSoaBatch([{ ...element, nodeIds: ['N1', 'N2', 'N3', 'N3'] }], nodeIndex).reason, 'SHELL_NODE_INDEX_DUPLICATE');
assert.equal(buildShellSoaBatch([{ ...element, t: true }], nodeIndex).reason, 'SHELL_THICKNESS_INVALID');
assert.equal(buildShellSoaBatch([{ ...element, nodes: nodes.map((node, index) => ({ ...node, x: index === 2 ? [] : node.x })) }], nodeIndex).reason, 'SHELL_NODE_COORDINATE_INVALID');

const baseDomain = {
  schemaVersion: 5,
  nodes,
  members: [],
  materials: [{ id: 'MAT', E: 30e9, nu: 0.2, density: 2400 }],
  sections: [],
  shells: [{ id: 'S1', nodeIds: nodes.map((node) => node.id), matId: 'MAT', thickness: 0.2, formulation: 'shell' }],
  loads: [],
  loadCases: [],
  loadCombinations: [],
};

assertCode(() => packDomainBinary({ ...baseDomain, shells: [{ ...baseDomain.shells[0], id: undefined }] }), 'DOMAIN_ID_REQUIRED');
assertCode(() => packDomainBinary({ ...baseDomain, shells: [baseDomain.shells[0], { ...baseDomain.shells[0] }] }), 'DOMAIN_ID_DUPLICATE');
assertCode(() => packDomainBinary({ ...baseDomain, shells: [{ ...baseDomain.shells[0], formulation: 'invented' }] }), 'UNSUPPORTED_SHELL_FORMULATION');
assertCode(() => packDomainBinary({ ...baseDomain, shells: [{ ...baseDomain.shells[0], nodeIds: ['N1', 'N2', 'N3', 'N3'] }] }), 'BAD_SHELL_CONNECTIVITY');
assertCode(() => packDomainBinary({ ...baseDomain, shells: [{ ...baseDomain.shells[0], thickness: true }] }), 'BAD_SHELL_PROPS');
assertCode(() => packDomainBinary({ ...baseDomain, nodes: nodes.map((node, index) => ({ ...node, x: index === 0 ? true : node.x })) }), 'DOMAIN_NONFINITE');

const packed = packDomainBinary(baseDomain);
assert.deepEqual(validateDomainBinary(packed), { ok: true, errors: [] });
const defaultEquivalent = packDomainBinary({
  ...baseDomain,
  shells: [{ ...baseDomain.shells[0], formulation: undefined }],
});
assert.equal(defaultEquivalent.metadata.counts.shells, 0);
const defaultSteel = packDomainBinary({
  ...baseDomain,
  materials: [...baseDomain.materials, { id: 'steel', E: 200e9, nu: 0.3, density: 7850 }],
  shells: [{ ...baseDomain.shells[0], matId: undefined }],
});
assert.deepEqual(validateDomainBinary(defaultSteel), { ok: true, errors: [] });

const shellPressureDomain = {
  ...baseDomain,
  loads: [{ id: 'Q1', type: 'shellPressure', shell: 'S1', q: -12.5, case: 'D' }],
  loadCases: [{ id: 'D', type: 'dead' }],
};
const packedShellPressure = packDomainBinary(shellPressureDomain);
assert.deepEqual([...packedShellPressure.buffers.loadTargetKind], [3]);
assert.deepEqual([...packedShellPressure.buffers.loadTargetIndex], [0]);
assert.deepEqual([...packedShellPressure.buffers.loadValues], [-12.5, 0, 0, 0, 0, 0]);
assert.equal(packedShellPressure.metadata.bufferLayouts.loadTargetKind[3], 'shell');
assert.equal(packedShellPressure.metadata.bufferLayouts.loadValues.shellPressure.q, 0);
assert.deepEqual(unpackDomainBinary(packedShellPressure).loads, [{
  id: 'Q1',
  case: 'D',
  type: 'shellPressure',
  shell: 'S1',
  q: -12.5,
}]);

assertCode(
  () => packDomainBinary({ ...shellPressureDomain, loads: [{ ...shellPressureDomain.loads[0], shell: 'MISSING' }] }),
  'DOMAIN_SHELL_PRESSURE_TARGET_INVALID',
);
assertCode(
  () => packDomainBinary({ ...shellPressureDomain, loads: [{ ...shellPressureDomain.loads[0], q: true }] }),
  'DOMAIN_SHELL_PRESSURE_VALUE_INVALID',
);
assertCode(
  () => packDomainBinary({
    ...shellPressureDomain,
    shells: [{ ...baseDomain.shells[0], formulation: 'membrane' }],
  }),
  'DOMAIN_SHELL_PRESSURE_TARGET_UNSUPPORTED',
);

const corruptConnectivity = structuredClone(packed);
corruptConnectivity.buffers.shellConnectivity[0] = 999;
assert.equal(validateDomainBinary(corruptConnectivity).ok, false);
const corruptProperties = structuredClone(packed);
corruptProperties.buffers.shellProperties[0] = Number.NaN;
assert.equal(validateDomainBinary(corruptProperties).ok, false);
const corruptPressureTargetKind = structuredClone(packedShellPressure);
corruptPressureTargetKind.buffers.loadTargetKind[0] = 4;
assert.ok(validateDomainBinary(corruptPressureTargetKind).errors.includes('domain:load-target-kinds'));
const corruptPressureTargetIndex = structuredClone(packedShellPressure);
corruptPressureTargetIndex.buffers.loadTargetIndex[0] = 99;
assert.ok(validateDomainBinary(corruptPressureTargetIndex).errors.includes('domain:load-target-range'));
const corruptPressureValue = structuredClone(packedShellPressure);
corruptPressureValue.buffers.loadValues[0] = Number.NaN;
assert.ok(validateDomainBinary(corruptPressureValue).errors.includes('domain:load-values'));

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m9d-shell-contract-hardening-v2',
  batchFailuresCovered: 6,
  packFailuresCovered: 9,
  validatorFailuresCovered: 5,
  shellPressureRoundTrips: 1,
}, null, 2));

function assertCode(run, code) {
  assert.throws(run, (error) => error?.code === code, `expected ${code}`);
}
