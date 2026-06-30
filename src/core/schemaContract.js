import { SCHEMA_NAME, SCHEMA_VERSION } from './schema.js';
import { SIGN_CONVENTION_VERSION } from './signConvention.js';
import { UNIT_SYSTEM_VERSION } from './unitSystem.js';

export const SCHEMA_CONTRACT_VERSION = 'p2-t03-schema-contract';

export function buildSchemaContract() {
  return {
    version: SCHEMA_CONTRACT_VERSION,
    schemaName: SCHEMA_NAME,
    schemaVersion: SCHEMA_VERSION,
    migrationTarget: SCHEMA_VERSION,
    requiredCollections: [
      'nodes',
      'members',
      'loads',
      'materials',
      'sections',
      'loadCases',
      'loadCombinations',
    ],
    unitSystemVersion: UNIT_SYSTEM_VERSION,
    signConventionVersion: SIGN_CONVENTION_VERSION,
  };
}
