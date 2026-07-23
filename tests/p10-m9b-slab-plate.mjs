import assert from 'node:assert/strict';
import { buildSlabPlateDkq, buildSlabPlateMitc4, buildSlabPressureLoad, lumpedPlateMass, plateClosedForm } from '../src/index.js';
import { squarePlateBenchmark } from './helpers/p10Shell.mjs';

const input = { id: 'P1', nodes: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }], material: { E: 30e9, nu: 0.3, density: 2400 }, t: 0.1 };
const element = buildSlabPlateMitc4(input);
assert.equal(element.ok, true);
assert.equal(element.elementFormulation, 'MITC4');
const legacy = buildSlabPlateDkq(input);
assert.equal(legacy.version, element.version);
assert.deepEqual(legacy.matrix, element.matrix);
assert.ok(element.diagnostics.symmetryError < 1e-12);
const pressure = buildSlabPressureLoad(element, 10e3);
assert.ok(Math.abs(pressure.reduce((sum, value, index) => index % 6 === 2 ? sum + value : sum, 0) - 4e4) < 1e-9);
const mass = lumpedPlateMass(element);
assert.equal(mass.total, 960);

const moderateSkew = buildSlabPlateMitc4({
  ...input,
  id: 'P1-RHOMBUS-30',
  nodes: rhombusNodes(30),
});
assert.equal(moderateSkew.ok, true);
assert.equal(moderateSkew.qualification.status, 'pass');
assert.equal(moderateSkew.designEligibility.allowed, false);
assert.ok(moderateSkew.designEligibility.reasonCodes.includes('SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'));
assert.ok(moderateSkew.geometry.minimumJacobianReciprocalCondition > 0.26);

const extremeSkew = buildSlabPlateMitc4({
  ...input,
  id: 'P1-RHOMBUS-5',
  nodes: rhombusNodes(5),
});
assert.equal(extremeSkew.ok, true);
assert.equal(extremeSkew.qualification.status, 'blocked');
assert.equal(
  extremeSkew.qualification.reason,
  'SHELL_ELEMENT_JACOBIAN_CONDITION_OUTSIDE_QUALIFIED_RANGE',
);
assert.equal(extremeSkew.designEligibility.allowed, false);
assert.deepEqual(
  extremeSkew.designEligibility.reasonCodes,
  ['SHELL_ELEMENT_JACOBIAN_CONDITION_OUTSIDE_QUALIFIED_RANGE', 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
);
assert.ok(extremeSkew.geometry.minimumJacobianReciprocalCondition < 0.05);

const mildlyWarped = buildSlabPlateMitc4({
  ...input,
  id: 'P1-MILD-WARP',
  nodes: input.nodes.map((node, index) => ({ ...node, z: index === 2 ? 0.01 : 0 })),
});
assert.equal(mildlyWarped.ok, true);
assert.equal(mildlyWarped.qualification.status, 'pass');
assert.equal(mildlyWarped.designEligibility.allowed, false);
assert.ok(mildlyWarped.designEligibility.reasonCodes.includes('SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'));

const severelyWarped = buildSlabPlateMitc4({
  ...input,
  id: 'P1-SEVERE-WARP',
  nodes: input.nodes.map((node, index) => ({ ...node, z: index === 2 ? 1 : 0 })),
});
assert.equal(severelyWarped.ok, true);
assert.equal(severelyWarped.qualification.status, 'blocked');
assert.equal(severelyWarped.qualification.reason, 'SHELL_WARP_EXCEEDS_QUALIFIED_LIMIT');
assert.equal(severelyWarped.designEligibility.allowed, false);
assert.deepEqual(
  severelyWarped.designEligibility.reasonCodes,
  ['SHELL_WARP_EXCEEDS_QUALIFIED_LIMIT', 'SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'],
);

const tooThick = buildSlabPlateMitc4({ ...input, t: 2 });
assert.equal(tooThick.qualification.status, 'pass');
assert.deepEqual(tooThick.designEligibility.reasonCodes, ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED']);
const tooThin = buildSlabPlateMitc4({ ...input, t: 0.001 });
assert.equal(tooThin.qualification.status, 'pass');
assert.deepEqual(tooThin.designEligibility.reasonCodes, ['SHELL_MODEL_MESH_CONVERGENCE_REQUIRED']);

for (const invalid of [
  { patch: { E: 0 }, reason: 'SHELL_MATERIAL_E_INVALID' },
  { patch: { E: true }, reason: 'SHELL_MATERIAL_E_INVALID' },
  { patch: { E: [] }, reason: 'SHELL_MATERIAL_E_INVALID' },
  { patch: { nu: 0.5 }, reason: 'SHELL_MATERIAL_NU_INVALID' },
  { patch: { t: 0 }, reason: 'SHELL_THICKNESS_INVALID' },
  { patch: { t: undefined }, reason: 'SHELL_THICKNESS_INVALID' },
  { patch: { density: -1 }, reason: 'SHELL_DENSITY_INVALID' },
]) {
  const result = buildSlabPlateMitc4({ ...input, ...invalid.patch });
  assert.equal(result.ok, false);
  assert.equal(result.reason, invalid.reason);
}
assert.equal(buildSlabPlateMitc4({ ...input, E: 1e308, t: 10 }).reason, 'SHELL_STIFFNESS_NONFINITE');
assert.equal(buildSlabPlateMitc4({ ...input, density: Number.MAX_VALUE, t: 10 }).reason, 'SHELL_MASS_NONFINITE');
assert.equal(buildSlabPlateMitc4({
  ...input,
  nodes: input.nodes.map((node, index) => ({ ...node, x: index === 1 ? true : node.x })),
}).reason, 'SHELL_NODE_COORDINATE_INVALID');

for (const invalidPressure of [null, true, Number.NaN]) {
  assert.throws(
    () => buildSlabPressureLoad(element, invalidPressure),
    (error) => error?.code === 'SHELL_PRESSURE_INVALID',
  );
}
assert.throws(
  () => buildSlabPressureLoad(element, Number.MAX_VALUE),
  (error) => error?.code === 'SHELL_PRESSURE_LOAD_NONFINITE',
);
assert.throws(
  () => lumpedPlateMass({ ...element, material: { ...element.material, density: Number.MAX_VALUE }, thickness: 10 }),
  (error) => error?.code === 'SHELL_MASS_NONFINITE',
);

const simple = squarePlateBenchmark();
assert.ok(simple.relativeError < 1e-2, `SH-B01 plate error ${simple.relativeError}`);
const closedSimple = plateClosedForm({ E: 30e9, nu: 0.3, thickness: 0.2, a: 4, q: 1e4 });
const closedFixed = plateClosedForm({ E: 30e9, nu: 0.3, thickness: 0.2, a: 4, q: 1e4, support: 'fixed' });
assert.ok(closedFixed.wCenter < closedSimple.wCenter);
assert.throws(
  () => plateClosedForm({ E: true, thickness: 0.2, a: 4, q: 1e4 }),
  (error) => error?.code === 'SHELL_PLATE_CLOSED_FORM_INPUT_INVALID',
);
assert.throws(
  () => plateClosedForm({ E: 30e9, thickness: 0.2, a: 4, q: 1e4, support: 'invented' }),
  (error) => error?.code === 'SHELL_PLATE_CLOSED_FORM_INPUT_INVALID',
);
assert.throws(
  () => plateClosedForm({ E: Number.MAX_VALUE, thickness: Number.MAX_VALUE, a: 4, q: 1e4 }),
  (error) => error?.code === 'SHELL_PLATE_CLOSED_FORM_NONFINITE',
);

export const M9B_SNAPSHOT = Object.freeze({
  version: 'p10-m9b-verification-v2-hard-qualified-scope',
  simple,
  pressureResidual: 0,
  massTotal: mass.total,
  fixedToSimple: closedFixed.wCenter / closedSimple.wCenter,
  geometryQualification: Object.freeze({
    jacobianReciprocalConditionMinimum: element.qualification.jacobianReciprocalConditionMin,
    warpRatioMaximum: element.qualification.warpRatioMax,
    moderateSkewMinimumJacobianReciprocalCondition: moderateSkew.geometry.minimumJacobianReciprocalCondition,
    extremeSkewMinimumJacobianReciprocalCondition: extremeSkew.geometry.minimumJacobianReciprocalCondition,
    mildlyWarpedRatio: mildlyWarped.frame.maxWarpRatio,
    severelyWarpedRatio: severelyWarped.frame.maxWarpRatio,
  }),
});
console.log(JSON.stringify({ ok: true, ...M9B_SNAPSHOT }, null, 2));

function rhombusNodes(angleDegrees, side = 2) {
  const angle = angleDegrees * Math.PI / 180;
  const dx = side * Math.cos(angle);
  const dy = side * Math.sin(angle);
  return [
    { x: 0, y: 0, z: 0 },
    { x: side, y: 0, z: 0 },
    { x: side + dx, y: dy, z: 0 },
    { x: dx, y: dy, z: 0 },
  ];
}
