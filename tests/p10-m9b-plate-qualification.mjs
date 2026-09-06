import assert from 'node:assert/strict';
import {
  rectangularPlateBenchmark,
  rectangularMindlinPlateNavierReference,
} from './helpers/p10Shell.mjs';

const cases = [
  plateCase('SH-BQ-01-SQUARE-R20', { a: 4, b: 4, t: 0.2 }, 0.03),
  plateCase('SH-BQ-02-RECT-2TO1-R15', { a: 6, b: 3, t: 0.2 }, 0.05),
  plateCase('SH-BQ-03-RECT-4TO1-R20', { a: 8, b: 2, t: 0.1 }, 0.05),
  plateCase('SH-BQ-04-RECT-4TO1-R40', { a: 8, b: 2, t: 0.05 }, 0.05),
  plateCase('SH-BQ-05-RECT-4TO1-R100', { a: 8, b: 2, t: 0.02 }, 0.05),
];

const convergenceCases = [
  convergenceCase('SH-BQ-06-SQUARE-MESH-CONVERGENCE', { a: 4, b: 4, t: 0.2 }, 0.01),
  convergenceCase('SH-BQ-07-RECT-4TO1-MESH-CONVERGENCE', { a: 8, b: 2, t: 0.05 }, 0.01),
];

const reference161 = rectangularMindlinPlateNavierReference({ a: 8, b: 2, t: 0.1, terms: 161 });
const reference321 = rectangularMindlinPlateNavierReference({ a: 8, b: 2, t: 0.1, terms: 321 });
const referenceConvergence = Math.abs(reference321.wCenter - reference161.wCenter) / Math.abs(reference321.wCenter);
assert.ok(referenceConvergence < 1e-7, `Navier reference series has not converged: ${referenceConvergence}`);
assert.equal(cases[0].status, 'PASS', 'Existing square anchor must remain green.');

const failedCaseIds = [...cases, ...convergenceCases]
  .filter((row) => row.status !== 'PASS')
  .map((row) => row.caseId);
const qualification = {
  version: 'p10-m9b-plate-numerical-qualification-v2-mitc4',
  status: failedCaseIds.length ? 'BLOCKED' : 'PASS',
  referenceKind: 'reissner-mindlin-navier-simply-supported-udl',
  referenceConvergence,
  cases,
  convergenceCases,
  failedCaseIds,
  blocker: failedCaseIds.length ? 'SHELL_PLATE_ASPECT_THICKNESS_QUALIFICATION_FAILED' : null,
};

assert.equal(qualification.status, 'PASS');
assert.deepEqual(failedCaseIds, []);

export const M9B_QUALIFICATION_SNAPSHOT = Object.freeze(qualification);
console.log(JSON.stringify({ ok: true, ...qualification }, null, 2));

function plateCase(caseId, input, tolerance) {
  const result = rectangularPlateBenchmark({ ...input, divisionsX: 6, divisionsY: 6, navierTerms: 161, referenceTheory: 'mindlin' });
  return {
    caseId,
    geometry: { a: input.a, b: input.b, thickness: input.t },
    mesh: { divisionsX: result.divisionsX, divisionsY: result.divisionsY },
    aspectRatio: result.aspectRatio,
    shortSideThicknessRatio: result.shortSideThicknessRatio,
    computed: result.computed,
    reference: result.reference,
    relativeError: result.relativeError,
    tolerance,
    status: result.relativeError <= tolerance ? 'PASS' : 'FAIL',
  };
}

function convergenceCase(caseId, input, tolerance) {
  const coarse = rectangularPlateBenchmark({
    ...input, divisionsX: 8, divisionsY: 8, navierTerms: 161, referenceTheory: 'mindlin',
  });
  const fine = rectangularPlateBenchmark({
    ...input, divisionsX: 10, divisionsY: 10, navierTerms: 161, referenceTheory: 'mindlin',
  });
  const relativeChange = Math.abs(fine.computed - coarse.computed) / Math.abs(fine.computed);
  return {
    caseId,
    geometry: { a: input.a, b: input.b, thickness: input.t },
    coarseMesh: { divisionsX: coarse.divisionsX, divisionsY: coarse.divisionsY },
    fineMesh: { divisionsX: fine.divisionsX, divisionsY: fine.divisionsY },
    coarse: coarse.computed,
    fine: fine.computed,
    relativeChange,
    tolerance,
    status: relativeChange <= tolerance ? 'PASS' : 'FAIL',
  };
}
