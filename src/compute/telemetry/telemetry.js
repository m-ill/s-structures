import { stableHash } from '../../core/stableHash.js';

export const COMPUTE_TELEMETRY_VERSION = 'p9-compute-telemetry-v1';
export const COMPUTE_TELEMETRY_DEFAULT_LIMIT = 1024;

export function createComputeTelemetry(options = {}) {
  const runId = requiredText(options.runId, 'runId');
  const limit = positiveInteger(options.limit, COMPUTE_TELEMETRY_DEFAULT_LIMIT);
  const clock = typeof options.clock === 'function' ? options.clock : defaultClock;
  const rows = [];
  let sequence = 0;
  let droppedCount = 0;

  return Object.freeze({
    version: COMPUTE_TELEMETRY_VERSION,
    runId,
    record(event = {}) {
      const row = Object.freeze({
        sequence: ++sequence,
        atMs: finite(clock()),
        stage: String(event.stage || 'compute'),
        operationId: event.operationId == null ? null : String(event.operationId),
        backendId: event.backendId == null ? null : String(event.backendId),
        durationMs: optionalFinite(event.durationMs),
        bytes: nonnegativeInteger(event.bytes, 0),
        status: String(event.status || 'info'),
        detail: boundedDetail(event.detail),
      });
      rows.push(row);
      if (rows.length > limit) {
        rows.shift();
        droppedCount += 1;
      }
      return row;
    },
    snapshot() {
      const core = {
        version: COMPUTE_TELEMETRY_VERSION,
        runId,
        limit,
        droppedCount,
        eventCount: rows.length,
        lastSequence: sequence,
        rows: [...rows],
      };
      return Object.freeze({ ...core, telemetryHash: stableHash(core) });
    },
  });
}

function boundedDetail(value) {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= 2048 ? text : text.slice(0, 2048);
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!normalized) throw new TypeError(field + ' is required.');
  return normalized;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError('Telemetry clock must be finite.');
  return number;
}

function optionalFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function defaultClock() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
