import { buildSchemaContract } from './schemaContract.js';
import { getSignConvention } from './signConvention.js';
import { summarizeUnitSystem } from './unitSystem.js';

export const BASELINE_CONTRACT_VERSION = 'p2-mvp-s1-baseline-contract';

export function buildBaselineContract(model = null) {
  return {
    version: BASELINE_CONTRACT_VERSION,
    phase: 'P2-MVP-S1',
    tickets: ['T01', 'T02', 'T03'],
    unitSystem: summarizeUnitSystem(model?.unitSystem),
    signConvention: getSignConvention(),
    schema: buildSchemaContract(),
    acceptance: [
      'unitSystem is present on created and migrated models',
      'sign convention is available through API',
      'schema contract is versioned for migration checks',
    ],
  };
}
