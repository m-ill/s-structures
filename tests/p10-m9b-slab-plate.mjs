import assert from 'node:assert/strict';
import { buildSlabPlateDkq, buildSlabPressureLoad, lumpedPlateMass, plateClosedForm } from '../src/index.js';
import { squarePlateBenchmark } from './helpers/p10Shell.mjs';

const input = { id: 'P1', nodes: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }], material: { E: 30e9, nu: 0.3, density: 2400 }, t: 0.2 };
const element = buildSlabPlateDkq(input);
assert.equal(element.ok, true);
assert.ok(element.diagnostics.symmetryError < 1e-12);
const pressure = buildSlabPressureLoad(element, 10e3);
assert.ok(Math.abs(pressure.reduce((sum, value, index) => index % 6 === 2 ? sum + value : sum, 0) - 4e4) < 1e-9);
const mass = lumpedPlateMass(element);
assert.equal(mass.total, 1920);

const simple = squarePlateBenchmark();
assert.ok(simple.relativeError < 1e-2, `SH-B01 plate error ${simple.relativeError}`);
const closedSimple = plateClosedForm({ E: 30e9, nu: 0.3, thickness: 0.2, a: 4, q: 1e4 });
const closedFixed = plateClosedForm({ E: 30e9, nu: 0.3, thickness: 0.2, a: 4, q: 1e4, support: 'fixed' });
assert.ok(closedFixed.wCenter < closedSimple.wCenter);

export const M9B_SNAPSHOT = Object.freeze({ version: 'p10-m9b-verification-v1', simple, pressureResidual: 0, massTotal: mass.total, fixedToSimple: closedFixed.wCenter / closedSimple.wCenter });
console.log(JSON.stringify({ ok: true, ...M9B_SNAPSHOT }, null, 2));
