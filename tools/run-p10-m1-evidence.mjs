import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildM1XvalReferenceArtifacts,
  createXvalCaseDefinitions,
  runPathologicalModelBattery,
  runXvalSuite,
  serializeXvalReferenceArtifact,
  xv01HandCalculation,
  xv02HandCalculation,
} from '../src/index.js';
import { stableHash, stableStringify } from '../src/core/stableHash.js';

const evidenceRoot = path.resolve('reports', 'validation-evidence', 'phase10');
const xvalRoot = path.join(evidenceRoot, 'xv');
const modelRoot = path.resolve('tests', 'fixtures', 'phase10', 'xval');
await Promise.all([
  mkdir(evidenceRoot, { recursive: true }),
  mkdir(xvalRoot, { recursive: true }),
  mkdir(modelRoot, { recursive: true }),
]);

const cases = createXvalCaseDefinitions();
const artifacts = buildM1XvalReferenceArtifacts(cases);
const crossValidation = runXvalSuite({ cases, artifacts });
const pathologicalBattery = runPathologicalModelBattery();
if (crossValidation.status !== 'OK') throw new Error('P10-M1 cross-validation evidence is not green.');
if (pathologicalBattery.status !== 'OK') throw new Error('P10-M1 pathological battery evidence is not green.');

for (const definition of cases) {
  await writeJson(path.join(modelRoot, `${definition.caseId}.model.json`), definition.model);
}
for (const artifact of artifacts) {
  const suffix = artifact.status === 'ready' ? 'hand-calc' : 'pending-reference';
  await writeFile(
    path.join(xvalRoot, `${artifact.caseId}-${suffix}.json`),
    serializeXvalReferenceArtifact(artifact),
    'utf8',
  );
}

const handCalculationCore = {
  version: 'p10-m1-hand-calculation-evidence-v1',
  status: 'OK',
  generatedOn: '2026-07-20',
  cases: {
    'XV-01': xv01HandCalculation(),
    'XV-02': xv02HandCalculation(),
  },
};
const handCalculations = {
  ...handCalculationCore,
  artifactHash: stableHash(handCalculationCore).slice(0, 24),
};

await Promise.all([
  writeJson(path.join(evidenceRoot, 'p10-m1-cross-validation.json'), crossValidation),
  writeJson(path.join(evidenceRoot, 'p10-m1-pathological-battery.json'), pathologicalBattery),
  writeJson(path.join(evidenceRoot, 'p10-m1-hand-calculations.json'), handCalculations),
]);

console.log(JSON.stringify({
  ok: true,
  crossValidationArtifactHash: crossValidation.artifactHash,
  pathologicalBatteryArtifactHash: pathologicalBattery.artifactHash,
  handCalculationArtifactHash: handCalculations.artifactHash,
  xvPass: crossValidation.summary.pass,
  xvPending: crossValidation.summary.pending,
  bmPass: pathologicalBattery.summary.pass,
  externallyCrossValidated: crossValidation.releaseQualification.externallyCrossValidated,
}, null, 2));

async function writeJson(file, value) {
  await writeFile(file, `${stableStringify(value)}\n`, 'utf8');
}
