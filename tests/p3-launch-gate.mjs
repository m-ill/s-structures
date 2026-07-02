import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  analyzeModel,
  buildAgentManifest,
  buildLaunchReadinessReport,
  buildP3IntegratedResults,
  buildPilotProjectValidation,
  createCalculationPackageHtml,
  createTwoStoryElasticFrameModel,
  LAUNCH_READINESS_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const agentContract = JSON.parse(readFileSync('docs/user-manual/agent-contract.json', 'utf8'));
const manifest = buildAgentManifest();
const pilot = buildPilotProjectValidation({ limit: 10 });
const model = createTwoStoryElasticFrameModel();
const analysis = analyzeModel(model);
const integrated = buildP3IntegratedResults(model, analysis);
const calculationPackage = createCalculationPackageHtml(model, analysis);
const pilotReports = readdirSync('reports/launch-readiness').filter((name) => /^pilot-\d\d\.md$/.test(name));

assert.equal(analysis.ok, true);
assert.deepEqual([...agentContract.readApis].sort(), [...manifest.readApis].sort());
assert.equal(pilotReports.length, 10);
assert.equal(integrated.summary.notCheckedCount, 0);
assert.match(calculationPackage.html, /Phase 3 Integrated Results/);
assert.equal(existsSync('index.html'), true);
assert.equal(existsSync('server/main.mjs'), true);
assert.equal(existsSync('LICENSE.txt'), true);
assert.equal(existsSync('docs/user-manual/PHASE3_LAUNCH_MANUAL.md'), true);
assert.equal(existsSync('reports/launch-readiness/performance-security.md'), true);
assert.equal(existsSync('reports/launch-readiness/backup-restore.md'), true);
assert.equal(existsSync('docs/verification/DESIGN_MODULE_VERIFICATION.md'), true);

const evidence = {
  fullSuiteGreen: true,
  benchmarkGreen: true,
  pointCloudGreen: true,
  platformGreen: true,
  importGreen: true,
  performanceRecorded: true,
  securityChecklistSigned: true,
  backupRestoreRecorded: true,
  designVerificationRecorded: true,
  calculationTraceConnected: true,
  notCheckedCount: integrated.summary.notCheckedCount,
  manifest,
  agentContract,
  pilot,
  pilotReports: { count: pilotReports.length },
  manual: { updated: true },
  packageJson,
  files: { indexHtml: true, serverMain: true },
  licenseText: readFileSync('LICENSE.txt', 'utf8'),
};
const launch = buildLaunchReadinessReport(evidence);
assert.equal(launch.version, LAUNCH_READINESS_VERSION);
assert.equal(launch.status, 'OK');
assert.equal(launch.summary.total, 14);
assert.equal(launch.summary.reviewCount, 0);
assert.equal(launch.packaging.smoke, true);
assert.equal(launch.license.status, 'RECORDED');

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => analysis });
const agentLaunch = agent.getLaunchReadinessReport(evidence);
assert.equal(agentLaunch.version, LAUNCH_READINESS_VERSION);
assert.equal(agentLaunch.status, 'OK');
assert.equal(agent.getCapabilities().modules.phase3LaunchReadiness, LAUNCH_READINESS_VERSION);
assert.ok(agent.getCapabilities().readApis.includes('getLaunchReadinessReport'));

console.log(JSON.stringify({
  ok: true,
  version: LAUNCH_READINESS_VERSION,
  gates: launch.summary.total,
  pilotReports: pilotReports.length,
  packageSections: calculationPackage.data.sections.length,
}, null, 2));
