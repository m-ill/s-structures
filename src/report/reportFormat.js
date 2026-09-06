export function renderMetricGrid(items, options = {}) {
  const gridClass = options.gridClass || 'grid';
  const itemClass = options.itemClass || 'metric';
  return `<div class="${escapeHtml(gridClass)}">${items.map(([label, value]) => (
    `<div class="${escapeHtml(itemClass)}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`
  )).join('')}</div>`;
}

export function renderTable(headers, rows, options = {}) {
  const emptyText = options.emptyText || 'No data available.';
  if (!rows?.length) return `<div class="note">${escapeHtml(emptyText)}</div>`;
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('')}</tbody></table>`;
}

export function renderMessageTable(messages, options = {}) {
  if (!messages?.length) return `<div class="note">${escapeHtml(options.emptyText || 'No messages.')}</div>`;
  const headers = options.headers || ['Level', 'Code', 'Target', 'Message'];
  return renderTable(headers, messages.map((item) => [
    item.level,
    item.code || '-',
    item.target || '-',
    item.message || '-',
  ]));
}

export function renderList(items) {
  return `<div class="note"><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}

export function analysisStatus(analysis) {
  if (!analysis) return 'Idle';
  if (analysis.empty) return 'No model';
  return analysis.ok ? 'OK' : 'Check';
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 1000) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(2);
  return number.toFixed(3);
}

export function formatForce(value) {
  return value == null ? '-' : `${formatNumber(value)} kN`;
}

export function formatMoment(value) {
  return value == null ? '-' : `${formatNumber(value)} kN*m`;
}

export function formatLength(value) {
  return value == null ? '-' : `${formatNumber(Number(value) * 1000)} mm`;
}

export function formatRatio(value) {
  return value == null ? '-' : formatNumber(value);
}

export function formatDriftRatio(value) {
  if (value == null) return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Math.abs(number) < 0.01 ? number.toFixed(5) : formatNumber(number);
}

export function formatVector(value, formatter) {
  if (!Array.isArray(value)) return '-';
  return `[${value.map((item) => formatter(item)).join(', ')}]`;
}

export function formatTraceInputs(inputs = []) {
  return inputs.map((item) => `${item.symbol}=${formatTraceValue(item.value)}${item.unit ? ` ${item.unit}` : ''}`).join(', ');
}

export function formatTraceValue(value) {
  const number = Number(value);
  if (value == null || value === '') return '-';
  return Number.isFinite(number) ? formatNumber(number) : String(value);
}

export function statusLabel(status) {
  return String(status || 'UNCK').toUpperCase();
}

export function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function stripTrailingLineWhitespace(value) {
  return value.replace(/[ \t]+$/gm, '');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
