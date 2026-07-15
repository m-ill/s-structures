import { stableHash } from '../../../core/stableHash.js';

export const WEBGPU_SEGMENTED_BUFFER_VERSION = 'p9-m4-webgpu-segmented-buffer-v1';

export function alignWebGpuBytes(value, alignment = 4) {
  const bytes = nonnegativeInteger(value, 'byteLength');
  const unit = positiveInteger(alignment, 'alignment');
  return Math.ceil(bytes / unit) * unit;
}

export function planWebGpuSegments(byteLength, options = {}) {
  const logicalBytes = nonnegativeInteger(byteLength, 'byteLength');
  const alignment = positiveInteger(options.alignment ?? 4, 'alignment');
  const maxBufferSize = positiveInteger(options.maxBufferSize, 'maxBufferSize');
  const maxLogicalSegment = Math.floor(maxBufferSize / alignment) * alignment;
  if (maxLogicalSegment < alignment) throw segmentError('WEBGPU_SEGMENT_LIMIT_INVALID', 'maxBufferSize is smaller than alignment.');
  const segments = [];
  let offset = 0;
  while (offset < logicalBytes) {
    const logicalByteLength = Math.min(maxLogicalSegment, logicalBytes - offset);
    const allocatedByteLength = alignWebGpuBytes(logicalByteLength, alignment);
    segments.push(Object.freeze({
      index: segments.length,
      logicalOffset: offset,
      logicalByteLength,
      allocatedByteLength,
    }));
    offset += logicalByteLength;
  }
  const core = {
    version: WEBGPU_SEGMENTED_BUFFER_VERSION,
    logicalByteLength: logicalBytes,
    allocatedByteLength: segments.reduce((sum, row) => sum + row.allocatedByteLength, 0),
    alignment,
    maxBufferSize,
    segmentCount: segments.length,
    segments,
  };
  return Object.freeze({ ...core, planHash: stableHash(core) });
}

export function segmentWebGpuBytes(value, options = {}) {
  const bytes = toBytes(value);
  const plan = planWebGpuSegments(bytes.byteLength, options);
  const segments = plan.segments.map((row) => {
    const data = bytes.slice(row.logicalOffset, row.logicalOffset + row.logicalByteLength);
    return Object.freeze({ ...row, data, contentHash: stableHash(Array.from(data)) });
  });
  return Object.freeze({ ...plan, segments: Object.freeze(segments) });
}

export function joinWebGpuSegments(contract = {}) {
  const output = new Uint8Array(nonnegativeInteger(contract.logicalByteLength, 'logicalByteLength'));
  for (const row of contract.segments || []) {
    const data = toBytes(row.data);
    if (data.byteLength !== row.logicalByteLength) throw segmentError('WEBGPU_SEGMENT_LENGTH_MISMATCH', 'Segment data length is invalid.');
    if (stableHash(Array.from(data)) !== row.contentHash) throw segmentError('WEBGPU_SEGMENT_HASH_MISMATCH', 'Segment content hash is invalid.');
    output.set(data, row.logicalOffset);
  }
  return output;
}

function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw segmentError('WEBGPU_SEGMENT_SOURCE_INVALID', 'Segment source must be an ArrayBuffer or typed array.');
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw segmentError('WEBGPU_SEGMENT_FIELD_INVALID', `${field} must be a positive integer.`);
  return number;
}

function nonnegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw segmentError('WEBGPU_SEGMENT_FIELD_INVALID', `${field} must be a nonnegative integer.`);
  return number;
}

function segmentError(code, message) {
  return Object.assign(new Error(message), { code });
}
