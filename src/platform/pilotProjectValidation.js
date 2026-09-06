import {
  createAllRepresentativeBuildingModels,
} from '../examples/representativeBuildings.js';
import { buildPilotProjectRow } from './pilotProjectRow.js';

export const PILOT_PROJECT_VALIDATION_VERSION = 'p2-t50-pilot-project-validation';

export function buildPilotProjectValidation(options = {}) {
  const rows = createAllRepresentativeBuildingModels()
    .slice(0, options.limit || Infinity)
    .map(({ spec, model }) => buildPilotProjectRow(spec, model, options));
  return { version: PILOT_PROJECT_VALIDATION_VERSION, ticket: 'T50', rows, summary: summarize(rows) };
}

function summarize(rows) {
  return {
    pilotCount: rows.length,
    analysisOkCount: rows.filter((row) => row.analysisOk).length,
    warnOrNgReviewCount: rows.filter((row) => row.reviewStatus !== 'OK').length,
    status: rows.every((row) => row.analysisOk) ? 'OK' : 'NG',
  };
}
