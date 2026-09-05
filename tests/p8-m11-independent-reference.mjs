import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  auditPhase8ReferenceConvention,
  buildPhase8IndependentReferenceCatalog,
  compareReferenceValues,
  eulerBernoulliCantileverReference,
  integrateLinearSdofNewmarkReference,
  rectangularSteelSectionReference,
  runPhase8IndependentReferenceQualification,
  solveIndependentDenseSystem,
} from '../src/index.js';
import {
  getPhase8VerificationSuite,
  verificationRegistryManifest,
} from '../verification/index.js';

const qualification = runPhase8IndependentReferenceQualification();
assert.equal(qualification.status, 'PASS');
assert.equal(qualification.externalCommercialComparison, false);
assert.equal(qualification.results.length, 5);
assert.ok(qualification.results.every((row) => row.status === 'PASS'));

const catalog = buildPhase8IndependentReferenceCatalog();
assert.equal(catalog.sources.length, 4);
assert.ok(catalog.sources.every((row) => row.productionCodeImported === false && row.sourceHash));
const convention = auditPhase8ReferenceConvention();
assert.equal(convention.ok, true);
assert.equal(convention.signs.sectionAxial, 'tension-positive');

const matrix = [[4, 1], [2, 3]];
const solved = solveIndependentDenseSystem(matrix, [6, 8]);
assert.deepEqual(solved.solution.map((value) => Number(value.toFixed(12))), [1, 2]);
assert.ok(solved.residual <= 1e-14);
assert.equal(compareReferenceValues(solved.solution, [1, 2], { relativeTolerance: 1e-12 }).ok, true);
assert.throws(() => solveIndependentDenseSystem([[1, 2], [2, 4]], [1, 2]), (error) => error.code === 'REFERENCE_MATRIX_SINGULAR');

const cantilever = eulerBernoulliCantileverReference({ E: 2e8, I: 2.5e-4, L: 3, P: 10 });
assert.equal(cantilever.response.tipDisplacement, 0.0018);
const section = rectangularSteelSectionReference({ width: 0.3, depth: 0.5, yieldStress: 275000 });
assert.equal(section.response.plasticSectionModulus, 0.01875);
const dynamic = integrateLinearSdofNewmarkReference({
  mass: 1,
  damping: 0.1,
  stiffness: 25,
  dt: 0.01,
  groundAcceleration: [0, 0.2, -0.1, 0],
});
assert.equal(dynamic.response.displacement.length, 4);
assert.ok(dynamic.response.displacement.every(Number.isFinite));

const source = await readFile(new URL('../src/nonlinear/qualification/independentReferences.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /productionPushover|productionNlth|corotationalFrame3d|wasmSparseBackend|equilibrium\/assembler/);
assert.match(source, /No production element, assembly, equilibrium, sparse-solver/);

const suite = getPhase8VerificationSuite('P8-M11-QUALIFICATION-RELEASE');
assert.equal(suite.milestone, 'P8-M11');
assert.equal(suite.verificationIds.length, 21);
assert.equal(verificationRegistryManifest().version, 'p8-m11-verification-registry-v12');

console.log(JSON.stringify({
  ok: true,
  referenceStatus: qualification.status,
  referenceCount: qualification.results.length,
  qualificationHash: qualification.qualificationHash,
  catalogHash: catalog.catalogHash,
  conventionHash: convention.conventionHash,
}, null, 2));
