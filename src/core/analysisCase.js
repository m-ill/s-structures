export const ANALYSIS_CASE_VERSION = 'p5-analysis-case-v1';

export const ANALYSIS_CASE_KINDS = new Set([
  'static',
  'modal',
  'responseSpectrum',
  'buckling',
  'linearTha',
  'pushover',
  'nlth',
]);

export const ANALYSIS_CASE_STATUSES = new Set([
  'not-run',
  'running',
  'ok',
  'failed',
  'stale',
  'review-required',
  'preliminary',
  'designBlocked',
]);

const DEFAULT_NAMES = {
  static: 'Static analysis',
  modal: 'Modal analysis',
  responseSpectrum: 'Response spectrum',
  buckling: 'Buckling trace',
  linearTha: 'Linear time history',
  pushover: 'Pushover',
  nlth: 'NLTH trace',
};

export function defaultAnalysisCases() {
  return [];
}

export function createAnalysisCase(input = {}, existing = []) {
  const kind = ANALYSIS_CASE_KINDS.has(input.kind) ? input.kind : 'static';
  const id = cleanString(input.id) || nextAnalysisCaseId(existing);
  return normalizeAnalysisCase({
    id,
    name: input.name || DEFAULT_NAMES[kind] || 'Analysis case',
    kind,
    settings: input.settings || {},
    input: input.input || {},
    status: input.status || 'not-run',
    lastRun: input.lastRun || null,
  });
}

export function normalizeAnalysisCases(cases = []) {
  if (!Array.isArray(cases)) return [];
  const used = new Set();
  return cases
    .map((item, index) => normalizeAnalysisCase(item, index, used))
    .filter(Boolean);
}

export function normalizeAnalysisCase(item = {}, index = 0, used = new Set()) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const kind = ANALYSIS_CASE_KINDS.has(item.kind) ? item.kind : 'static';
  const fallbackId = `AC${index + 1}`;
  const id = uniqueId(cleanString(item.id) || fallbackId, used);
  used.add(id);
  const status = ANALYSIS_CASE_STATUSES.has(item.status) ? item.status : 'not-run';
  return {
    id,
    name: cleanString(item.name) || DEFAULT_NAMES[kind] || id,
    kind,
    settings: clonePlainObject(item.settings),
    input: clonePlainObject(item.input),
    status,
    lastRun: normalizeLastRun(item.lastRun),
  };
}

export function validateAnalysisCases(cases = []) {
  const errors = [];
  if (!Array.isArray(cases)) {
    return [{ code: 'BAD_ANALYSIS_CASE_COLLECTION', message: 'analysisCases must be an array.', target: 'analysisCases' }];
  }
  const ids = new Set();
  cases.forEach((item, index) => {
    const target = item?.id || `analysisCases[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ code: 'BAD_ANALYSIS_CASE', message: 'Analysis case must be an object.', target });
      return;
    }
    if (!cleanString(item.id)) errors.push({ code: 'ANALYSIS_CASE_MISSING_ID', message: 'Analysis case is missing id.', target });
    else if (ids.has(item.id)) errors.push({ code: 'DUPLICATE_ANALYSIS_CASE_ID', message: `Duplicate analysis case id: ${item.id}`, target });
    ids.add(item.id);
    if (!ANALYSIS_CASE_KINDS.has(item.kind)) errors.push({ code: 'BAD_ANALYSIS_CASE_KIND', message: `Unsupported analysis case kind: ${item.kind}`, target });
    if (!ANALYSIS_CASE_STATUSES.has(item.status)) errors.push({ code: 'BAD_ANALYSIS_CASE_STATUS', message: `Unsupported analysis case status: ${item.status}`, target });
    if (item.settings != null && !isPlainObject(item.settings)) errors.push({ code: 'BAD_ANALYSIS_CASE_SETTINGS', message: 'Analysis case settings must be an object.', target });
    if (item.input != null && !isPlainObject(item.input)) errors.push({ code: 'BAD_ANALYSIS_CASE_INPUT', message: 'Analysis case input must be an object.', target });
    if (item.lastRun != null && !isPlainObject(item.lastRun)) errors.push({ code: 'BAD_ANALYSIS_CASE_LAST_RUN', message: 'Analysis case lastRun must be null or an object.', target });
  });
  return errors;
}

export function markAnalysisCasesStale(cases = []) {
  return normalizeAnalysisCases(cases).map((item) => (
    ['ok', 'failed', 'review-required', 'preliminary', 'designBlocked'].includes(item.status)
      ? { ...item, status: 'stale' }
      : item
  ));
}

export function nextAnalysisCaseId(existing = []) {
  const ids = new Set((existing || []).map((item) => item?.id).filter(Boolean));
  let n = ids.size + 1;
  while (ids.has(`AC${n}`)) n += 1;
  return `AC${n}`;
}

function normalizeLastRun(lastRun) {
  if (!isPlainObject(lastRun)) return null;
  const status = ANALYSIS_CASE_STATUSES.has(lastRun.status) ? lastRun.status : null;
  const resultRef = cleanString(lastRun.resultRef || lastRun.resultKey) || null;
  return {
    at: cleanString(lastRun.at) || null,
    ok: lastRun.ok == null ? status === 'ok' : Boolean(lastRun.ok),
    status,
    message: cleanString(lastRun.message) || '',
    resultRef,
    resultKey: cleanString(lastRun.resultKey || lastRun.resultRef) || null,
    summary: clonePlainObject(lastRun.summary),
    modelSignature: cleanString(lastRun.modelSignature) || null,
    qualification: cleanString(lastRun.qualification) || null,
    designTransferAllowed: lastRun.designTransferAllowed === true,
    retainedSuccessfulResult: lastRun.retainedSuccessfulResult === true,
  };
}

function uniqueId(base, used) {
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clonePlainObject(value) {
  if (!isPlainObject(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
