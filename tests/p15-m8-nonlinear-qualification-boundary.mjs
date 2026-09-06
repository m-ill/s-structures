import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  NONLINEAR_BENCHMARK_VERSION as publicVersion,
  PUSHOVER_REGRESSION_BASELINE as publicBaseline,
  runNonlinearFiberNlthBenchmarks as publicFiberNlth,
  runNonlinearGeometryBenchmarks as publicGeometry,
  runNonlinearHingeControlBenchmarks as publicHingeControl,
} from '../src/index.js';
import {
  NONLINEAR_BENCHMARK_VERSION,
  PUSHOVER_REGRESSION_BASELINE,
  runNonlinearFiberNlthBenchmarks,
  runNonlinearGeometryBenchmarks,
  runNonlinearHingeControlBenchmarks,
} from '../src/nonlinear/qualification/nonlinearBenchmarks.js';
import * as compatibilityFacade from '../verification/framework/nonlinearBenchmarks.js';
import { analyzePhase15Architecture } from '../verification/harnesses/check-phase15-architecture.mjs';

assert.equal(publicVersion, NONLINEAR_BENCHMARK_VERSION);
assert.strictEqual(publicBaseline, PUSHOVER_REGRESSION_BASELINE);
assert.strictEqual(publicGeometry, runNonlinearGeometryBenchmarks);
assert.strictEqual(publicHingeControl, runNonlinearHingeControlBenchmarks);
assert.strictEqual(publicFiberNlth, runNonlinearFiberNlthBenchmarks);
assert.strictEqual(compatibilityFacade.runNonlinearGeometryBenchmarks, runNonlinearGeometryBenchmarks);
assert.strictEqual(compatibilityFacade.runNonlinearHingeControlBenchmarks, runNonlinearHingeControlBenchmarks);
assert.strictEqual(compatibilityFacade.runNonlinearFiberNlthBenchmarks, runNonlinearFiberNlthBenchmarks);

const report = await analyzePhase15Architecture();
const nonlinearVerificationImports = report.forbiddenImports.filter((finding) => (
  finding.rule === 'production-verification'
  && finding.source.startsWith('src/nonlinear/')
));
assert.deepEqual(
  nonlinearVerificationImports,
  [],
  'production nonlinear modules must not import the verification layer',
);

await assert.rejects(access('src/verification/nonlinearBenchmarks.js'), { code: 'ENOENT' });
const relocation = JSON.parse(await readFile('verification/archive/p16-m2-m5-relocation-map.json', 'utf8'));
const relocated = relocation.mappings.find((mapping) => (
  mapping.source === 'src/verification/nonlinearBenchmarks.js'
));
assert.equal(relocated?.target, 'verification/framework/nonlinearBenchmarks.js');

console.log(JSON.stringify({
  ok: true,
  version: 'p15-m8-nonlinear-qualification-boundary-v2',
  publicApiParity: true,
  historicalProductFacadeRemoved: true,
  nonlinearProductionVerificationImports: nonlinearVerificationImports.length,
}, null, 2));
