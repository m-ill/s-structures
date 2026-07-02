import assert from 'node:assert/strict';
import {
  buildAgentManifest,
  buildPhase3EvidenceRegister,
  PHASE3_EVIDENCE_REGISTER_VERSION,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const empty = buildPhase3EvidenceRegister();
assert.equal(empty.version, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.equal(empty.summary.requiredCount, 16);
assert.equal(empty.summary.acceptedCount, 0);
assert.equal(empty.summary.evidenceComplete, false);
assert.equal(empty.summary.productionReady, false);
assert.equal(empty.summary.agentDecision, 'collect-phase3-evidence');
assert.ok(empty.summary.missing.includes('real-office-dxf-fixtures'));
assert.ok(empty.summary.missing.includes('real-pointcloud-files'));
assert.ok(empty.summary.missing.includes('nonlinear-solver-certification'));
assert.ok(empty.summary.missing.includes('security-signoff'));
assert.ok(empty.agentUse.relatedApis.includes('getPhase3OwnerSignoffReview'));

const evidence = [
  { id: 'real-office-dxf-fixtures', accepted: true, reviewer: 'engineer', reportPath: 'reports/import-validation/dxf.md' },
  { id: 'real-pointcloud-files', status: 'accepted', reviewer: 'owner', reportPath: 'reports/pointcloud-validation/scan.md' },
  { id: 'security-signoff', accepted: true, owner: 'owner', reportPath: 'reports/launch-readiness/security.md' },
];
const partial = buildPhase3EvidenceRegister({ evidence });
assert.equal(partial.summary.acceptedCount, 3);
assert.equal(partial.rows.find((row) => row.id === 'real-office-dxf-fixtures').status, 'ACCEPTED');
assert.equal(partial.rows.find((row) => row.id === 'real-pointcloud-files').records[0].accepted, true);
assert.ok(partial.summary.missing.includes('external-dwg-converter-log'));

const full = buildPhase3EvidenceRegister({
  evidence: empty.rows.map((row) => ({ id: row.id, accepted: true })),
});
assert.equal(full.summary.acceptedCount, 16);
assert.deepEqual(full.summary.missing, []);
assert.equal(full.summary.evidenceComplete, true);
assert.equal(full.summary.agentDecision, 'phase3-evidence-ready-for-owner-and-engineer-review');
assert.equal(full.summary.productionReady, false);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3EvidenceRegister, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.ok(manifest.readApis.includes('getPhase3EvidenceRegister'));
assert.ok(manifest.dataContracts.includes('phase3EvidenceRegister'));
assert.equal(manifest.qaCommands.phase3EvidenceRegister, 'node tests/p3-evidence-register.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3EvidenceRegister().version, PHASE3_EVIDENCE_REGISTER_VERSION);
assert.equal(agent.getPhase3EvidenceRegister({ evidence }).summary.acceptedCount, 3);

console.log(JSON.stringify({
  ok: true,
  version: PHASE3_EVIDENCE_REGISTER_VERSION,
  requiredCount: empty.summary.requiredCount,
  partialAccepted: partial.summary.acceptedCount,
}, null, 2));
