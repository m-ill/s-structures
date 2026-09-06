import { SCHEMA_NAME, SCHEMA_VERSION } from './schema.js';
import { ANALYSIS_CRITERIA_VERSION } from './analysisCriteria.js';
import { SIGN_CONVENTION_VERSION } from './signConvention.js';
import { UNIT_SYSTEM_VERSION } from './unitSystem.js';
import { NONLINEAR_REGISTRY_COLLECTIONS, NONLINEAR_SCHEMA_CONTRACT_VERSION } from './nonlinearSchema.js';

export const SCHEMA_CONTRACT_VERSION = 'p8-m0-schema-contract-v5';

export function buildSchemaContract() {
  return {
    version: SCHEMA_CONTRACT_VERSION,
    schemaName: SCHEMA_NAME,
    schemaVersion: SCHEMA_VERSION,
    minimumReadableSchemaVersion: 1,
    maximumReadableSchemaVersion: SCHEMA_VERSION,
    rejectsFutureSchemaVersions: true,
    migrationTarget: SCHEMA_VERSION,
    requiredCollections: [
      'nodes',
      'members',
      'loads',
      'materials',
      'sections',
      'loadCases',
      'loadCombinations',
      'analysisCases',
      'massSources',
      'sourceRegistry',
      'stories',
      'diaphragms',
      ...NONLINEAR_REGISTRY_COLLECTIONS,
    ],
    unitSystemVersion: UNIT_SYSTEM_VERSION,
    signConventionVersion: SIGN_CONVENTION_VERSION,
    analysisCriteriaVersion: ANALYSIS_CRITERIA_VERSION,
    nonlinearSchemaContractVersion: NONLINEAR_SCHEMA_CONTRACT_VERSION,
    optionalObjects: [
      'analysisCriteria',
      'designBasis',
      'projectSetup',
    ],
  };
}
