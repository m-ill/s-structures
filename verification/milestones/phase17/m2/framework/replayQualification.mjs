import { sha256Canonical } from '../../../../framework/phase17/canonical.mjs';

export const P17_REPLAY_QUALIFICATION_VERSION = 'p17-replay-qualification-v1';

export function createP17ReplayAudit(input = {}) {
  const auditKind = String(input.auditKind || '');
  if (!['REFERENCE_BYTES', 'EXTRACTION_COMPARISON', 'PHYSICS_MUTATION', 'PDF_VISUAL_PARITY'].includes(auditKind)) {
    throw replayError('P17_REPLAY_AUDIT_KIND_INVALID', `Unsupported replay audit: ${auditKind || '(missing)'}.`);
  }
  const status = ['PASS', 'FAIL', 'PENDING', 'BLOCKED'].includes(input.status) ? input.status : 'BLOCKED';
  const sourceArtifacts = (input.sourceArtifacts || []).map((row) => ({
    path: String(row.path || ''),
    byteLength: Number(row.byteLength || 0),
    sha256: String(row.sha256 || ''),
    status: row.status === 'PASS' ? 'PASS' : 'FAIL',
  }));
  if (sourceArtifacts.some((row) => !row.path || !Number.isInteger(row.byteLength) || row.byteLength < 0 || !/^[a-f0-9]{64}$/u.test(row.sha256))) {
    throw replayError('P17_REPLAY_SOURCE_ARTIFACT_INVALID', 'Replay source artifact binding is invalid.');
  }
  const reasonCodes = [...new Set(input.reasonCodes || [])].sort();
  if (status !== 'PASS' && !reasonCodes.length) throw replayError('P17_REPLAY_BLOCKER_REASON_REQUIRED', 'Non-PASS replay audits require a reason code.');
  const core = {
    version: 'p17-replay-audit-v1',
    caseId: input.caseId || 'SB1',
    runId: input.runId || null,
    auditKind,
    status,
    sourceArtifacts,
    replayHash: input.replayHash || null,
    reasonCodes,
  };
  return Object.freeze({ ...core, auditHash: sha256Canonical(core) });
}

function replayError(code, message) {
  return Object.assign(new Error(message), { code });
}

