import assert from 'node:assert/strict';
import {
  DYNAMIC_COMPLETENESS_VERSION,
  LOADS_V2_VERSION,
  buildLoadsV2Trace,
  combineModalCqc,
  createTwoStoryElasticFrameModel,
  runLinearSdofTha,
  runResponseSpectrum,
} from '../src/index.js';

const model = createTwoStoryElasticFrameModel();
const trace = buildLoadsV2Trace(model, { windPressure: 0.9, seismicBaseShear: 120, snowLoad: 0.5 });
assert.equal(trace.version, LOADS_V2_VERSION);
assert.ok(trace.wind.length > 0 && trace.seismic.length > 0);
assert.equal(trace.other.snow, 0.5);

const responses = [{ period: 1, displacement: 2 }, { period: 1.1, displacement: 1 }];
assert.ok(combineModalCqc(responses, 0.05) >= Math.sqrt(5));

const rsa = runResponseSpectrum([
  { id: 'M1', period: 1, omega: 2 * Math.PI, participation: { x: { gamma: 1, massRatio: 0.6 } } },
  { id: 'M2', period: 1.1, omega: 2 * Math.PI / 1.1, participation: { x: { gamma: 0.5, massRatio: 0.2 } } },
], [0], [1], [1, 0, 0], { method: 'CQC', directions: ['x'], points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }] });
assert.equal(rsa.method, 'CQC');
assert.ok(rsa.combined.x.cqcDisplacement > 0);

const tha = runLinearSdofTha({ period: 1, accelerations: [0, 0.1, -0.1, 0] });
assert.equal(tha.version, DYNAMIC_COMPLETENESS_VERSION);
assert.equal(tha.rows.length, 4);

console.log(JSON.stringify({ ok: true, version: 'p3-m13-loads-dynamics' }, null, 2));
