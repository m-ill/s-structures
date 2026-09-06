import { stableHash } from '../../core/stableHash.js';

export const RESOURCE_LEDGER_VERSION = 'p9-resource-ledger-v1';

export function createResourceLedger(options = {}) {
  const runId = requiredText(options.runId, 'runId');
  const resources = new Map();
  let sequence = 0;
  let disposed = false;

  return Object.freeze({
    version: RESOURCE_LEDGER_VERSION,
    runId,
    register(resource, detail = {}) {
      assertActive();
      const token = runId + ':resource-' + (++sequence);
      const row = {
        token,
        kind: String(detail.kind || 'resource'),
        owner: String(detail.owner || runId),
        bytes: nonnegativeInteger(detail.bytes ?? resource?.byteLength, 0),
        resource,
        disposer: typeof detail.dispose === 'function'
          ? detail.dispose
          : typeof resource?.dispose === 'function' ? resource.dispose.bind(resource) : null,
      };
      resources.set(token, row);
      return token;
    },
    async release(token) {
      assertActive();
      const row = resources.get(token);
      if (!row) throw ledgerError('RESOURCE_TOKEN_UNKNOWN', 'Unknown resource token.');
      resources.delete(token);
      if (row.disposer) await row.disposer();
      return snapshot();
    },
    snapshot,
    assertBalanced() {
      const state = snapshot();
      if (state.outstandingCount !== 0) {
        throw ledgerError('RESOURCE_LEDGER_UNBALANCED', 'Resource ledger has ' + state.outstandingCount + ' outstanding resource(s).');
      }
      return state;
    },
    async disposeAll() {
      if (disposed) return snapshot();
      const rows = [...resources.values()].reverse();
      resources.clear();
      const failures = [];
      for (const row of rows) {
        try {
          if (row.disposer) await row.disposer();
        } catch (error) {
          failures.push({ token: row.token, code: error?.code || 'RESOURCE_DISPOSE_FAILED', message: error?.message || String(error) });
        }
      }
      disposed = true;
      const state = snapshot();
      if (failures.length) throw ledgerError('RESOURCE_DISPOSE_FAILED', JSON.stringify(failures));
      return state;
    },
  });

  function snapshot() {
    const rows = [...resources.values()].map(({ token, kind, owner, bytes }) => ({ token, kind, owner, bytes }));
    const core = {
      version: RESOURCE_LEDGER_VERSION,
      runId,
      disposed,
      outstandingCount: rows.length,
      outstandingBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
      rows,
    };
    return Object.freeze({ ...core, ledgerHash: stableHash(core) });
  }

  function assertActive() {
    if (disposed) throw ledgerError('RESOURCE_LEDGER_DISPOSED', 'Resource ledger has been disposed.');
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw ledgerError('RESOURCE_LEDGER_FIELD_REQUIRED', field + ' is required.');
  return normalized;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function ledgerError(code, message) {
  return Object.assign(new Error(message), { code });
}
