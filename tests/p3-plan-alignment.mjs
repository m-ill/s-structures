import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3PlanAlignmentReport,
  PHASE3_PLAN_ALIGNMENT_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const manifest = buildAgentManifest();
const report = buildPhase3PlanAlignmentReport(manifest);

assert.equal(report.version, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.equal(report.sourceDocCount, 14);
assert.equal(report.stages.length, 6);
assert.equal(report.milestones.length, 21);
assert.equal(report.status, 'OK');
assert.equal(report.agentReadable, true);
assert.equal(report.missing.length, 0);
assert.ok(report.sourceDocs.includes('docs/phase3/ROADMAP.md'));
assert.ok(report.sourceDocs.includes('docs/phase3/IMPLEMENTATION_BACKLOG.md'));
assert.deepEqual(report.milestones.map((row) => row.id), Array.from({ length: 21 }, (_, index) => `P3-M${index}`));
assert.ok(report.milestones.find((row) => row.id === 'P3-M6').tickets.includes('P3-T26'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M13').tickets.includes('P3-T82'));
assert.ok(report.milestones.find((row) => row.id === 'P3-M20').tests.includes('tests/p3-launch-gate.mjs'));
assert.equal(report.activeTicketCount, 93);
assert.equal(report.plannedTicketCount, 95);
assert.deepEqual(report.absorbedTickets.map((row) => row.ticket), ['P3-T57', 'P3-T60']);
assert.equal(manifest.modules.phase3PlanAlignment, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.ok(manifest.readApis.includes('getPhase3PlanAlignment'));
assert.ok(manifest.dataContracts.includes('phase3PlanAlignment'));

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
const apiReport = agent.getPhase3PlanAlignment();
assert.equal(apiReport.version, PHASE3_PLAN_ALIGNMENT_VERSION);
assert.equal(apiReport.status, 'OK');

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_PLAN_ALIGNMENT_VERSION,
  milestones: report.milestones.length,
  activeTickets: report.activeTicketCount,
  plannedTickets: report.plannedTicketCount,
}, null, 2));
