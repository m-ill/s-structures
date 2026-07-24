import assert from 'node:assert/strict';
import { availableAgentActions } from '../src/ui/indexAgentActionCatalog.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';
import {
  P11_REPORT_EXPORT_ACTIONS,
  buildReportExportView,
  createReportExportWorkflow,
} from '../src/ui/indexReportExportWorkflow.js';

const snapshotHash = 'a'.repeat(64);
const figureHash = 'b'.repeat(64);
const input = {
  projectId: 'PILOT-OFFICE-01',
  projectName: 'Pilot Office',
  sourceRevision: 'p11-m7-test',
  snapshot: {
    reportSnapshotHash: snapshotHash,
    verdict: { overall: 'CONDITIONAL_PASS' },
  },
  currentReportSnapshotHash: snapshotHash,
  figureManifest: {
    status: 'complete',
    reportSnapshotHash: snapshotHash,
    figureManifestHash: figureHash,
    figureCount: 7,
  },
};
const opened = [];
const remote = createFakeTransport();
const workflow = createReportExportWorkflow({
  transport: remote,
  openArtifact: async (artifact) => opened.push(artifact),
  now: () => Date.parse('2026-07-23T00:00:00.000Z'),
});

const readiness = workflow.preflight(input);
assert.equal(readiness.ready, true);
assert.equal(readiness.sceneCoverage, 7);
assert.equal(readiness.verdict, 'CONDITIONAL_PASS');
const uiPlan = await workflow.plan({ ...input, source: 'ui' });
const agentPlan = await workflow.plan({ ...input, source: 'agent' });
assert.equal(uiPlan.jobId, agentPlan.jobId);
assert.equal(uiPlan.planHash, agentPlan.planHash);
assert.equal(remote.planCalls, 1);
const runningView = buildReportExportView(uiPlan, workflow.list(), readiness);
assert.equal(runningView.canRun, true);
const completed = await workflow.run(uiPlan.jobId);
assert.equal(completed.status, 'completed');
assert.equal(completed.progress, 1);
assert.equal(completed.reportSnapshotHash, snapshotHash);
assert.deepEqual(Object.keys(completed.artifacts), ['ko-KR', 'en-US']);
const artifactSet = workflow.artifacts(completed.jobId);
assert.equal(artifactSet.planHash, completed.planHash);
assert.equal(artifactSet.reportSnapshotHash, snapshotHash);
await workflow.openArtifact({ jobId: completed.jobId, locale: 'ko-KR' });
assert.equal(opened.length, 1);
assert.equal(opened[0].locale, 'ko-KR');
const completedView = buildReportExportView(completed, workflow.list(), readiness);
assert.equal(completedView.canOpen, true);
assert.equal(completedView.historyCount, 1);

const cancelPlan = await workflow.plan({ ...input, sourceRevision: 'p11-m7-cancel' });
const cancelled = await workflow.cancel(cancelPlan.jobId);
assert.equal(cancelled.stage, 'cancelling');
assert.ok(cancelled.cancelAcknowledgementMs < 2000);
assert.equal(workflow.list().length, 2);

const stale = workflow.preflight({ ...input, currentReportSnapshotHash: 'c'.repeat(64) });
assert.equal(stale.ready, false);
assert.equal(stale.issues[0].code, 'P11_REPORT_EXPORT_SNAPSHOT_STALE');
assert.ok(stale.issues[0].remediation.includes('다시'));
const unavailable = createReportExportWorkflow().preflight(input);
assert.equal(unavailable.ready, false);
assert.equal(unavailable.issues[0].code, 'P11_REPORT_EXPORT_ADAPTER_UNAVAILABLE');
const fallback = workflow.browserFallback({
  reports: {
    'ko-KR': { html: '<html lang="ko-KR"></html>' },
    'en-US': { html: '<html lang="en-US"></html>' },
  },
});
assert.equal(fallback.mode, 'manual-print-ready');
assert.equal(fallback.silentPdfSaved, false);

const agent = createIndexAgentApi({}, null, {
  reportExportWorkflow: workflow,
  analyzeForIndex: () => null,
});
const agentHistory = await agent.execute('listReportExports', {});
assert.equal(agentHistory.jobs.length, 2);
const agentArtifacts = agent.execute('getReportExportArtifacts', { jobId: completed.jobId });
assert.equal(agentArtifacts.artifacts.planHash, uiPlan.planHash);
for (const action of P11_REPORT_EXPORT_ACTIONS) {
  assert.ok(availableAgentActions().includes(action), `${action} missing from Agent action catalog`);
}

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M7',
  actions: P11_REPORT_EXPORT_ACTIONS.length,
  uiAgentPlanHashParity: true,
  snapshotHashParity: true,
  artifactHashParity: true,
  historyRows: workflow.list().length,
  cancelAcknowledgementMs: cancelled.cancelAcknowledgementMs,
  reasonRemediationCoverage: 1,
  browserFalseSuccess: 0,
}, null, 2));

function createFakeTransport() {
  const jobs = new Map();
  let sequence = 0;
  const transport = {
    planCalls: 0,
    async plan(request) {
      transport.planCalls += 1;
      sequence += 1;
      const job = {
        jobId: `P11-M7-${sequence}`,
        status: 'planned',
        stage: 'planned',
        progress: 0,
        planHash: String(sequence).padStart(64, '0'),
        reportSnapshotHash: request.snapshot.reportSnapshotHash,
      };
      jobs.set(job.jobId, job);
      return { ...job };
    },
    async run(jobId) {
      const row = jobs.get(jobId);
      Object.assign(row, {
        status: 'completed',
        stage: 'completed',
        progress: 1,
        manifestPath: `PILOT/${jobId}/artifact-manifest.json`,
        artifacts: {
          'ko-KR': { locale: 'ko-KR', pdf: 'report-ko.pdf', sha256: '1'.repeat(64), pages: 14, bytes: 550000 },
          'en-US': { locale: 'en-US', pdf: 'report-en.pdf', sha256: '2'.repeat(64), pages: 14, bytes: 510000 },
        },
      });
      return { ...row };
    },
    async status(jobId) {
      return { ...jobs.get(jobId) };
    },
    async cancel(jobId) {
      const row = jobs.get(jobId);
      Object.assign(row, { status: 'running', stage: 'cancelling', progress: 0 });
      return { ...row };
    },
  };
  return transport;
}
