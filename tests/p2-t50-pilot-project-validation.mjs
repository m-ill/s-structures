import assert from 'node:assert/strict';
import {
  buildPilotProjectValidation,
  PILOT_PROJECT_VALIDATION_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const pilot = buildPilotProjectValidation({ limit: 10 });
assert.equal(pilot.version, PILOT_PROJECT_VALIDATION_VERSION);
assert.equal(pilot.ticket, 'T50');
assert.equal(pilot.rows.length, 10);
assert.equal(pilot.summary.pilotCount, 10);
assert.equal(pilot.summary.analysisOkCount, 10);
assert.equal(pilot.summary.status, 'OK');
assert.ok(pilot.rows.every((row) => row.nodeCount > 0 && row.memberCount > 0 && row.comboCount > 0));

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} }, {});
assert.equal(agent.getPilotProjectValidation({ limit: 2 }).version, PILOT_PROJECT_VALIDATION_VERSION);
assert.equal(agent.getCapabilities().modules.pilotProjectValidation, PILOT_PROJECT_VALIDATION_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getPilotProjectValidation'));

console.log(JSON.stringify({
  ok: true,
  version: PILOT_PROJECT_VALIDATION_VERSION,
  pilotCount: pilot.summary.pilotCount,
  warnOrNgReviewCount: pilot.summary.warnOrNgReviewCount,
}, null, 2));
