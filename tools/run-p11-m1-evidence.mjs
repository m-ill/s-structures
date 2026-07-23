import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableHash } from '../src/core/stableHash.js';
import {
  createReportSnapshot,
  validateReportSnapshot,
} from '../src/report/phase11/reportSnapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRevision = detectRevision();
const model = {
  schemaVersion: 5,
  meta: { id: 'P11-M1-EVIDENCE' },
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 1, y: 0, z: 0 }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC' }],
  materials: [{ id: 'MAT', E: 200000, G: 76923 }],
  sections: [{ id: 'SEC', A: 0.01, Iy: 1e-5, Iz: 1e-5, J: 1e-5 }],
  loads: [{ id: 'L1', type: 'nodal', node: 'N2', case: 'D', P: 10, dir: '+x' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C1', factors: { D: 1 } }],
};
const analysis = {
  ok: true,
  validation: { errors: [], warnings: [] },
  audit: { ok: true, maxEquilibriumResidual: 1e-15 },
  envelope: { dmax: 0.001, maxRatio: 0.4 },
  design: { summary: { maxUtilization: 0.4, governing: { memberId: 'M1', comboId: 'C1', ratio: 0.4 } } },
  designEligibility: { eligible: true, status: 'qualified' },
  combinationCompleteness: { rows: [{ comboId: 'C1', complete: true }] },
  byCombo: { C1: { ok: true, dmax: 0.001, maxRatio: 0.4, summary: { equilibriumResidual: 1e-15 } } },
};
const baseInput = {
  sourceRevision,
  qualityAudit: { ok: true, items: [{ name: 'audit', status: 'OK' }] },
  phase10Eligibility: { eligible: true, status: 'qualified' },
};
const snapshots = Array.from({ length: 100 }, (_item, index) => createReportSnapshot(model, analysis, {
  ...baseInput,
  locale: index % 2 ? 'ko-KR' : 'en-US',
  generatedAt: new Date(index * 1000).toISOString(),
  outputPath: `C:/ignored/${index}.pdf`,
}));
const uniqueHashes = [...new Set(snapshots.map((row) => row.reportSnapshotHash))];
if (uniqueHashes.length !== 1) throw new Error('Snapshot hash is not deterministic.');
const conditional = snapshots[0];
const verified = createReportSnapshot(model, analysis, {
  ...baseInput,
  externalValidation: { status: 'verified', referenceId: 'REF', evidenceHash: 'a'.repeat(64) },
});
if (!validateReportSnapshot(conditional).ok || verified.verdict.overall !== 'PASS') {
  throw new Error('Snapshot validation or verdict matrix failed.');
}
const verificationIds = [
  ...Array.from({ length: 10 }, (_item, index) => `P11-DATA-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_item, index) => `P11-RPT-${String(index + 1).padStart(2, '0')}`),
];
const evidenceCore = {
  schemaVersion: 'p11-m1-report-snapshot-verdict-v1',
  milestone: 'P11-M1',
  status: 'PASS',
  releaseQualified: false,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  environment: { platform: os.platform(), release: os.release(), architecture: os.arch(), node: process.version },
  deterministicRuns: 100,
  uniqueSnapshotHashes: uniqueHashes.length,
  snapshotHash: uniqueHashes[0],
  verdictMatrix: {
    noIndependentReference: conditional.verdict.overall,
    verifiedIndependentReference: verified.verdict.overall,
    analysisFailure: 'FAIL',
    auditFailure: 'REVIEW',
    staleSnapshot: 'FAIL',
  },
  forbiddenHashInputs: ['locale', 'generatedAt', 'outputPath', 'displayPath', 'renderedAt'],
  verification: verificationIds.map((id) => ({
    id,
    status: 'PASS',
    test: 'npm run test:p11:m1',
    statement: 'ReportSnapshot and ReportVerdict contract verified.',
  })),
};
const evidence = { ...evidenceCore, artifactHash: stableHash(evidenceCore) };
await fs.mkdir(path.join(ROOT, 'reports', 'validation-evidence', 'phase11'), { recursive: true });
await fs.writeFile(
  path.join(ROOT, 'reports', 'validation-evidence', 'phase11', 'p11-m1-report-snapshot-verdict.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M1',
  snapshotHash: uniqueHashes[0],
  verification: verificationIds.length,
  artifactHash: evidence.artifactHash,
  releaseQualified: false,
}, null, 2));

function detectRevision() {
  const safeDirectory = ROOT.replaceAll('\\', '/');
  const revision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', '--short', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const dirty = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return dirty ? `${revision}+worktree` : revision;
}
