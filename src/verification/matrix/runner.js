import { resolveCriterion } from '../../core/analysisCriteria.js';
import { VERIFICATION_ASSEMBLY_CASES } from './assemblyCases.js';
import { VERIFICATION_DYNAMIC_CASES } from './dynamicCases.js';
import { VERIFICATION_ELEMENT_CASES } from './elementCases.js';
import { buildVerificationRecord, VERIFICATION_MATRIX_RECORD_VERSION } from './record.js';
import { VERIFICATION_STABILITY_CASES } from './stabilityCases.js';

export const VERIFICATION_MATRIX_VERSION = 'p6-m3-verification-matrix-v1';

export const VERIFICATION_MATRIX_CASES = Object.freeze([
  ...VERIFICATION_ELEMENT_CASES,
  ...VERIFICATION_ASSEMBLY_CASES,
  ...VERIFICATION_DYNAMIC_CASES,
  ...VERIFICATION_STABILITY_CASES,
]);

export function runVerificationMatrix(options = {}) {
  const criteriaModel = options.criteriaModel || options.model || {};
  const cases = selectedCases(options);
  const records = [];

  for (const caseDef of cases) {
    const tolerance = caseTolerance(caseDef, criteriaModel);
    const outputs = runCase(caseDef, options);
    for (const output of outputs) {
      records.push(buildVerificationRecord({
        caseId: output.caseId || caseDef.caseId,
        tier: output.tier || caseDef.tier,
        name: output.name || caseDef.name,
        reference: output.reference,
        computed: output.computed,
        tolerance: output.tolerance ?? tolerance,
        toleranceKey: output.toleranceKey ?? caseDef.toleranceKey ?? null,
        model: output.model,
        hashInput: output.hashInput,
        solverVersion: output.solverVersion,
        referenceSource: output.referenceSource || caseDef.referenceSource || null,
        metric: output.metric || caseDef.metric || null,
        units: output.units || caseDef.units || null,
        errorScale: output.errorScale ?? caseDef.errorScale ?? null,
        details: output.details || null,
      }));
    }
  }

  return {
    version: VERIFICATION_MATRIX_VERSION,
    recordVersion: VERIFICATION_MATRIX_RECORD_VERSION,
    ok: records.every((record) => record.status === 'OK'),
    summary: summarizeRecords(records, cases),
    coverage: coverage(cases, records),
    records,
  };
}

export async function writeVerificationMatrixEvidence(path, report = runVerificationMatrix()) {
  if (typeof window !== 'undefined') {
    throw new Error('Verification evidence files can only be written by the Node.js runtime.');
  }
  const [{ dirname }, { mkdirSync, writeFileSync }] = await Promise.all([
    import('node:path'),
    import('node:fs'),
  ]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return path;
}

function selectedCases(options = {}) {
  const requestedTiers = new Set((options.tiers || []).map((tier) => String(tier)));
  const requestedCaseIds = new Set((options.caseIds || []).map((caseId) => String(caseId)));
  return VERIFICATION_MATRIX_CASES.filter((caseDef) => {
    if (requestedTiers.size && !requestedTiers.has(caseDef.tier)) return false;
    if (requestedCaseIds.size && !requestedCaseIds.has(caseDef.caseId)) return false;
    return true;
  });
}

function caseTolerance(caseDef, criteriaModel) {
  if (Number.isFinite(Number(caseDef.tolerance))) return Number(caseDef.tolerance);
  return Number(resolveCriterion(criteriaModel, caseDef.toleranceKey, 1e-6));
}

function runCase(caseDef, options) {
  try {
    const output = caseDef.run(options);
    return Array.isArray(output) ? output : [output];
  } catch (error) {
    return [{
      computed: 'ERROR',
      reference: 0,
      errorScale: 1,
      hashInput: { caseId: caseDef.caseId, error: error?.message || String(error) },
      solverVersion: 'verification-matrix-runner-error',
      details: {
        error: error?.message || String(error),
        stack: error?.stack || null,
      },
    }];
  }
}

function summarizeRecords(records, cases) {
  const failed = records.filter((record) => record.status !== 'OK');
  const byTier = {};
  for (const record of records) {
    const tier = record.tier || 'unknown';
    byTier[tier] ||= { total: 0, ok: 0, failed: 0, maxRelError: 0 };
    byTier[tier].total += 1;
    if (record.status === 'OK') byTier[tier].ok += 1;
    else byTier[tier].failed += 1;
    if (Number.isFinite(record.relError)) byTier[tier].maxRelError = Math.max(byTier[tier].maxRelError, record.relError);
  }
  return {
    caseCount: cases.length,
    recordCount: records.length,
    okCount: records.length - failed.length,
    failedCount: failed.length,
    failedCaseIds: failed.map((record) => record.caseId),
    byTier,
    maxRelError: Math.max(0, ...records.map((record) => Number.isFinite(record.relError) ? record.relError : Number.POSITIVE_INFINITY)),
  };
}

function coverage(cases, records) {
  const expectedCaseIds = cases.map((caseDef) => caseDef.caseId);
  const recordCaseIds = new Set(records.map((record) => record.caseId));
  return {
    expectedCaseIds,
    recordedCaseIds: [...recordCaseIds].sort(),
    missingCaseIds: expectedCaseIds.filter((caseId) => !recordCaseIds.has(caseId)),
    tiers: [...new Set(cases.map((caseDef) => caseDef.tier))].sort(),
  };
}
