import assert from 'node:assert/strict';
import {
  ANALYSIS_CRITERIA_PRESETS,
  ANALYSIS_CRITERIA_VERSION,
  createModel,
  listAnalysisCriteriaKeys,
  migrateModel,
  resolveAnalysisCriteria,
  resolveCriterion,
  validateModel,
} from '../src/index.js';

assert.deepEqual(ANALYSIS_CRITERIA_PRESETS, ['kds', 'asce', 'eurocode', 'custom']);

const expectedKeys = [
  'criteria.solver.symWarn',
  'criteria.solver.symFail',
  'criteria.solver.resWarn',
  'criteria.solver.resFail',
  'criteria.solver.condWarn',
  'criteria.solver.condSingular',
  'criteria.solver.pivotSingular',
  'criteria.load.equilTol',
  'criteria.audit.equilibriumRelative',
  'criteria.tolerance.element.min',
  'criteria.tolerance.element.max',
  'criteria.tolerance.smallFrame.min',
  'criteria.tolerance.smallFrame.max',
  'criteria.tolerance.largeFrame.min',
  'criteria.tolerance.largeFrame.max',
  'criteria.tolerance.modal.min',
  'criteria.tolerance.modal.max',
  'criteria.tolerance.modalParticipation.min',
  'criteria.tolerance.modalParticipation.max',
  'criteria.tolerance.rsa.min',
  'criteria.tolerance.rsa.max',
  'criteria.tolerance.pdelta.min',
  'criteria.tolerance.pdelta.max',
  'criteria.tolerance.equivalentShellGlobal',
  'criteria.rsa.massMin',
  'criteria.rsa.massStrong',
  'criteria.rsa.cqcPeriodRatio.min',
  'criteria.rsa.cqcPeriodRatio.max',
  'criteria.rsa.dirFactor',
  'criteria.rsa.eccentricity',
  'criteria.pdelta.eR',
  'criteria.pdelta.eU',
  'criteria.pdelta.eE',
  'criteria.pdelta.maxIter',
  'criteria.pdelta.ampLimit',
  'criteria.pdelta.thetaCaution',
  'criteria.pdelta.thetaRequire',
  'criteria.pdelta.thetaStrong',
  'criteria.equivalentShell.driftErr',
  'criteria.equivalentShell.shearErr',
  'criteria.equivalentShell.momentErr',
];

const keys = listAnalysisCriteriaKeys();
for (const key of expectedKeys) {
  assert.ok(keys.includes(key), `missing criteria key: ${key}`);
}

const model = createModel();
assert.equal(model.analysisCriteria.version, ANALYSIS_CRITERIA_VERSION);
assert.equal(model.analysisCriteria.preset, 'kds');
assert.equal(resolveCriterion(model, 'pdelta.maxIter'), 30);
assert.equal(resolveCriterion(model, 'criteria.pdelta.eR'), 1e-6);
assert.equal(resolveCriterion(model, 'rsa.dirFactor'), 0.3);
assert.equal(resolveCriterion(model, 'rsa.cqcPeriodRatio').min, 0.9);
assert.equal(resolveCriterion(model, 'equivalentShell.shearErr'), 0.05);
assert.equal(resolveCriterion(model, 'audit.equilibriumRelative'), 1e-8);

const modernLegacy = createModel();
assert.equal(resolveCriterion(modernLegacy, 'pdelta.maxIter'), 30, 'new default criteria should not be replaced by legacy default analysisSettings');
modernLegacy.analysisSettings.pDeltaMaxIterations = 18;
modernLegacy.analysisSettings.pDeltaTolerance = 1e-5;
assert.equal(resolveCriterion(modernLegacy, 'pdelta.maxIter'), 18, 'changed legacy max iteration should remain readable');
assert.equal(resolveCriterion(modernLegacy, 'pdelta.eU'), 1e-5, 'changed legacy tolerance should map to displacement tolerance');

const overrideModel = createModel({
  analysisCriteria: {
    preset: 'custom',
    criteria: {
      pdelta: { maxIter: 44, thetaStrong: 0.18 },
      rsa: { dirFactor: 0.4, cqcPeriodRatio: { min: 0.85, max: 1.15 } },
      equivalentShell: { shearErr: 0.04 },
      audit: { equilibriumRelative: 1e-7 },
    },
  },
});
const override = resolveAnalysisCriteria(overrideModel);
assert.equal(override.preset, 'custom');
assert.equal(resolveCriterion(overrideModel, 'pdelta.maxIter'), 44);
assert.equal(resolveCriterion(overrideModel, 'rsa.dirFactor'), 0.4);
assert.equal(resolveCriterion(overrideModel, 'rsa.cqcPeriodRatio.max'), 1.15);
assert.equal(resolveCriterion(overrideModel, 'equivalentShell.shearErr'), 0.04);
assert.equal(resolveCriterion(overrideModel, 'audit.equilibriumRelative'), 1e-7);
assert.equal(override.trace.rows.find((row) => row.path === 'pdelta.maxIter').source, 'override');
assert.equal(override.trace.rows.find((row) => row.path === 'rsa.dirFactor').source, 'override');

const legacyModel = createModel();
delete legacyModel.analysisCriteria;
legacyModel.analysisSettings.pDeltaMaxIterations = 8;
legacyModel.analysisSettings.pDeltaTolerance = 1e-5;
legacyModel.analysisSettings.pDeltaMaxAmplification = 2.1;
legacyModel.analysisSettings.pDeltaThetaNegligible = 0.07;
legacyModel.analysisSettings.pDeltaThetaLimit = 0.19;
const legacy = resolveAnalysisCriteria(legacyModel);
assert.equal(resolveCriterion(legacyModel, 'pdelta.maxIter'), 8);
assert.equal(resolveCriterion(legacyModel, 'pdelta.eR'), 1e-5);
assert.equal(resolveCriterion(legacyModel, 'pdelta.eE'), 1e-5);
assert.equal(resolveCriterion(legacyModel, 'pdelta.ampLimit'), 2.1);
assert.equal(resolveCriterion(legacyModel, 'pdelta.thetaCaution'), 0.07);
assert.equal(resolveCriterion(legacyModel, 'pdelta.thetaStrong'), 0.19);
assert.ok(legacy.trace.legacyFallbackCount >= 7, 'legacy values should be visible in criteria trace');
assert.equal(legacy.trace.rows.find((row) => row.path === 'pdelta.maxIter').legacyKey, 'analysisSettings.pDeltaMaxIterations');

const invalid = createModel({
  analysisCriteria: {
    preset: 'made-up',
    criteria: {
      pdelta: { maxIter: 'bad', ampLimit: 0 },
      rsa: { massMin: 1.5, cqcPeriodRatio: { min: 1.2, max: 1.1 } },
      unknownGroup: { x: 1 },
    },
  },
});
const validation = validateModel(invalid);
const warningCodes = validation.warnings.map((warning) => warning.code);
assert.ok(warningCodes.includes('BAD_ANALYSIS_CRITERIA_PRESET'), 'invalid preset should warn');
assert.ok(warningCodes.includes('BAD_ANALYSIS_CRITERIA_TYPE'), 'wrong value type should warn');
assert.ok(warningCodes.includes('ANALYSIS_CRITERIA_OUT_OF_RANGE'), 'out-of-range criteria should warn');
assert.ok(warningCodes.includes('UNKNOWN_ANALYSIS_CRITERIA'), 'unknown criteria should warn');

const migrated = migrateModel({
  nodes: [],
  members: [],
  loads: [],
});
assert.equal(migrated.model.analysisCriteria.version, ANALYSIS_CRITERIA_VERSION);
assert.ok(migrated.migrations.some((item) => item.to === 'analysisCriteria'));

console.log(JSON.stringify({
  ok: true,
  criteriaVersion: ANALYSIS_CRITERIA_VERSION,
  keyCount: keys.length,
  legacyFallbackCount: legacy.trace.legacyFallbackCount,
  validationWarnings: validation.warnings.length,
}, null, 2));
