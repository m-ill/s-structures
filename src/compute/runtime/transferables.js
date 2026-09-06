export function collectComputeTransferables(value, initial = []) {
  const transferables = [];
  const included = new Set();
  const visited = new Set();
  for (const item of initial || []) add(item);
  visit(value);
  return transferables;

  function visit(item) {
    if (item == null || (typeof item !== 'object' && typeof item !== 'function')) return;
    if (isArrayBuffer(item)) return add(item);
    if (ArrayBuffer.isView(item)) return add(item.buffer);
    if (visited.has(item)) return;
    visited.add(item);
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
    } else if (item instanceof Map) {
      for (const [key, entry] of item) {
        visit(key);
        visit(entry);
      }
    } else if (item instanceof Set) {
      for (const entry of item) visit(entry);
    } else {
      for (const key of Object.keys(item).sort()) visit(item[key]);
    }
  }

  function add(value) {
    const buffer = ArrayBuffer.isView(value) ? value.buffer : value;
    if (!isArrayBuffer(buffer) || included.has(buffer) || buffer.byteLength === 0) return;
    included.add(buffer);
    transferables.push(buffer);
  }
}

export function postComputeMessage(target, message, transferables = null) {
  const post = typeof target === 'function' ? target : target?.postMessage?.bind(target);
  if (typeof post !== 'function') throw Object.assign(new Error('Worker postMessage target is unavailable.'), { code: 'POST_MESSAGE_UNAVAILABLE' });
  const transfer = transferables || collectComputeTransferables(message);
  post(message, transfer);
  return transfer;
}

function isArrayBuffer(value) {
  return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer;
}
