import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
assert.equal(report.scenarios.length, 5);
assert.equal(report.stages.length, 6);
assert.equal(report.milestones.length, 21);
assert.equal(report.status, 'OK');
assert.equal(report.requirements.functional.length, 32);
assert.equal(report.requirements.nonFunctional.length, 8);
assert.equal(report.requirements.successCriteria.length, 9);
assert.equal(report.requirements.launchGates.length, 14);
assert.equal(report.requirements.ok, true);
assert.equal(report.architecture.decisions.length, 10);
assert.equal(report.architecture.ok, true);
assert.deepEqual(report.architecture.decisions.map((row) => row.id), Array.from({ length: 10 }, (_, index) => `D${index + 1}`));
assert.equal(report.architecture.decisions.find((row) => row.id === 'D2').choice, 'node-http-router');
assert.equal(report.architecture.decisions.find((row) => row.id === 'D6').choice, 'webgl2-module');
assert.ok(report.architecture.moduleBoundaries.find((row) => row.id === 'server-to-src').rule.includes('analysis engine stays in browser'));
assert.ok(report.architecture.fileRouting.find((row) => row.path === 'src/import/').role.includes('ImportCandidate'));
assert.ok(report.requirements.functional.every((row) => row.covered));
assert.ok(report.requirements.nonFunctional.every((row) => row.covered));
assert.ok(report.requirements.successCriteria.every((row) => row.covered));
assert.deepEqual(report.requirements.functional.slice(0, 20).map((row) => row.id), Array.from({ length: 20 }, (_, index) => `FR-${String(index + 1).padStart(2, '0')}`));
assert.equal(report.requirements.functional.find((row) => row.id === 'FR-20').milestones[0], 'P3-M0');
assert.ok(report.requirements.functional.find((row) => row.id === 'FR-32').milestones.includes('P3-M18'));
assert.ok(report.requirements.nonFunctional.find((row) => row.id === 'NFR-06').milestones.includes('P3-M20'));
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

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.deepEqual(Object.keys(packageJson.dependencies || {}), []);
assert.deepEqual(Object.keys(packageJson.devDependencies || {}), []);

const serverFiles = listFiles('server').filter((file) => file.endsWith('.mjs'));
const forbiddenServerImports = serverFiles.filter((file) => {
  const text = readFileSync(file, 'utf8');
  return /from\s+['"]\.\.\/src\/(solver|design|nonlinear|results|report|dynamics|loads)\//.test(text);
});
assert.deepEqual(forbiddenServerImports, []);

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_PLAN_ALIGNMENT_VERSION,
  milestones: report.milestones.length,
  functionalRequirements: report.requirements.functional.length,
  architectureDecisions: report.architecture.decisions.length,
  activeTickets: report.activeTicketCount,
  plannedTickets: report.plannedTicketCount,
}, null, 2));

function listFiles(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}
