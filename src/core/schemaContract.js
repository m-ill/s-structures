import { SCHEMA_NAME, SCHEMA_VERSION } from './schema.js';
import { ANALYSIS_CRITERIA_VERSION } from './analysisCriteria.js';
import { SIGN_CONVENTION_VERSION } from './signConvention.js';
import { UNIT_SYSTEM_VERSION } from './unitSystem.js';

export const SCHEMA_CONTRACT_VERSION = 'p2-t03-schema-contract';

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
    ],
    unitSystemVersion: UNIT_SYSTEM_VERSION,
    signConventionVersion: SIGN_CONVENTION_VERSION,
    analysisCriteriaVersion: ANALYSIS_CRITERIA_VERSION,
    optionalObjects: [
      'analysisCriteria',
      'designBasis',
      'projectSetup',
    ],
  };
}
