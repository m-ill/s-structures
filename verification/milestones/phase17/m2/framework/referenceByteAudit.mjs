import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sha256Canonical } from '../../../../framework/phase17/canonical.mjs';

export const P17_REFERENCE_BYTE_AUDIT_VERSION = 'p17-reference-byte-audit-v1';

export function auditReferenceArtifactBytes(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || '.');
  const sourceRoot = path.resolve(input.sourceRoot || path.join(repoRoot, '..', 'STRIX-verification-21'));
  const rows = [];
  const reasons = [];
  for (const artifact of input.artifacts || []) {
    const logicalPath = String(artifact.path || '').replaceAll('\\', '/');
    let resolved;
    try {
      resolved = resolveLogicalPath(logicalPath, { repoRoot, sourceRoot });
      const bytes = readFileSync(resolved);
      const byteLength = statSync(resolved).size;
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const status = byteLength === artifact.byteLength && sha256 === artifact.sha256 ? 'PASS' : 'FAIL';
      if (status === 'FAIL') reasons.push('P17_REFERENCE_ARTIFACT_BYTE_MISMATCH');
      rows.push({ path: logicalPath, byteLength, sha256, status });
    } catch (error) {
      reasons.push(error?.code || 'P17_REFERENCE_ARTIFACT_READ_FAILED');
      rows.push({ path: logicalPath, byteLength: 0, sha256: '0'.repeat(64), status: 'FAIL' });
    }
  }
  if (!rows.length) reasons.push('P17_REFERENCE_ARTIFACT_SET_EMPTY');
  const core = {
    version: P17_REFERENCE_BYTE_AUDIT_VERSION,
    caseId: input.caseId || null,
    status: reasons.length ? 'FAIL' : 'PASS',
    sourceArtifacts: rows,
    reasonCodes: [...new Set(reasons)].sort(),
  };
  return Object.freeze({ ...core, auditHash: sha256Canonical(core) });
}

function resolveLogicalPath(logicalPath, { repoRoot, sourceRoot }) {
  if (!logicalPath || logicalPath.startsWith('/') || /^[A-Za-z]:/u.test(logicalPath)) {
    throw auditError('P17_REFERENCE_ARTIFACT_PATH_INVALID', `Invalid logical path: ${logicalPath || '(empty)'}`);
  }
  const sourcePrefix = 'STRIX-verification-21/';
  const base = logicalPath.startsWith(sourcePrefix) ? sourceRoot : repoRoot;
  const relative = logicalPath.startsWith(sourcePrefix) ? logicalPath.slice(sourcePrefix.length) : logicalPath;
  if (relative.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw auditError('P17_REFERENCE_ARTIFACT_PATH_INVALID', `Invalid logical path: ${logicalPath}`);
  }
  const resolvedBase = realpathSync(base);
  const candidate = realpathSync(path.resolve(base, ...relative.split('/')));
  if (candidate === resolvedBase || !candidate.startsWith(`${resolvedBase}${path.sep}`)) {
    throw auditError('P17_REFERENCE_ARTIFACT_PATH_ESCAPE', `${logicalPath} escapes its declared base.`);
  }
  if (!statSync(candidate).isFile()) throw auditError('P17_REFERENCE_ARTIFACT_NOT_FILE', `${logicalPath} is not a file.`);
  return candidate;
}

function auditError(code, message) {
  return Object.assign(new Error(message), { code });
}

