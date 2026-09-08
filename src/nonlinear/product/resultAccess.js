import { stableHash } from '../../core/stableHash.js';

export const NONLINEAR_RESULT_ACCESS_VERSION = 'p8-m10-result-access-v1';
export const NONLINEAR_HISTORY_EXPORT_VERSION = 'p8-m10-history-export-v1';

export function getNonlinearResultSlice(resultInput = {}, query = {}) {
  const wrapper = resultInput || {};
  const result = unwrapResult(wrapper);
  const kind = resultKind(wrapper, result);
  const slice = String(query.slice || query.type || defaultSlice(kind));
  let data;
  if (slice === 'overview') data = overviewSlice(wrapper, result, kind);
  else if (slice === 'capacity' || slice === 'curve') data = capacitySlice(result, query);
  else if (slice === 'history') data = historySlice(result, query);
  else if (slice === 'envelope' || slice === 'peak') data = envelopeSlice(result, query);
  else if (slice === 'story') data = storySlice(result, query);
  else if (slice === 'member') data = memberSlice(result, query);
  else if (slice === 'node') data = nodeSlice(result, query);
  else if (slice === 'hinge') data = hingeSlice(result, query);
  else if (slice === 'convergence') data = convergenceSlice(result, query);
  else if (slice === 'provenance' || slice === 'record') data = provenanceSlice(wrapper, result);
  else data = { available: false, reason: 'NONLINEAR_RESULT_SLICE_UNSUPPORTED', requestedSlice: slice };
  return deepFreeze({
    version: NONLINEAR_RESULT_ACCESS_VERSION,
    kind,
    slice,
    caseId: wrapper.caseId || result.analysisCaseId || result.runRecord?.caseId || null,
    runRecordId: wrapper.runRecordId || result.runRecord?.id || null,
    query: sanitizeQuery(query),
    data,
  });
}

export function paginateNonlinearHistory(rowsInput = [], options = {}) {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const pageSize = boundedInteger(options.pageSize, 200, 1, 5000);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = boundedInteger(options.page, 1, 1, pageCount);
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    pageCount,
    totalRows: rows.length,
    offset,
    rows: rows.slice(offset, offset + pageSize),
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

export function downsampleNonlinearHistory(pointsInput = [], options = {}) {
  const points = (pointsInput || []).map((row, index) => normalizePoint(row, index));
  const maxPoints = boundedInteger(options.maxPoints, 800, 4, 100000);
  if (points.length <= maxPoints) return points;
  const interior = points.slice(1, -1);
  const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
  const selected = [points[0]];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = Math.floor((bucket * interior.length) / bucketCount);
    const to = Math.max(from + 1, Math.floor(((bucket + 1) * interior.length) / bucketCount));
    const rows = interior.slice(from, to).filter((row) => Number.isFinite(row.y));
    if (!rows.length) continue;
    let minimum = rows[0];
    let maximum = rows[0];
    for (const row of rows.slice(1)) {
      if (row.y < minimum.y || (row.y === minimum.y && row.index < minimum.index)) minimum = row;
      if (row.y > maximum.y || (row.y === maximum.y && row.index < maximum.index)) maximum = row;
    }
    if (minimum.index <= maximum.index) selected.push(minimum, maximum);
    else selected.push(maximum, minimum);
  }
  selected.push(points.at(-1));
  const unique = [...new Map(selected.map((row) => [row.index, row])).values()]
    .sort((a, b) => a.index - b.index);
  if (unique.length <= maxPoints) return unique;
  return retainGlobalExtrema(unique, maxPoints);
}

export function exportNonlinearHistory(resultInput = {}, options = {}) {
  const result = unwrapResult(resultInput);
  const rows = historyRows(result);
  const format = String(options.format || 'csv').toLowerCase();
  const path = String(options.path || defaultHistoryPath(rows));
  const values = rows.map((row, index) => ({
    index,
    time: finite(row.time, index),
    value: finite(readPath(row, path), null),
  }));
  const core = {
    version: NONLINEAR_HISTORY_EXPORT_VERSION,
    caseId: resultInput.caseId || result.runRecord?.caseId || 'nonlinear',
    path,
    rowCount: values.length,
    raw: true,
  };
  if (format === 'json') {
    const content = JSON.stringify({ ...core, values }, null, 2);
    return deepFreeze({
      ...core,
      format,
      mimeType: 'application/json',
      fileName: `${safeFileName(core.caseId)}-${safeFileName(path)}.json`,
      content,
      contentHash: stableHash(content),
    });
  }
  const content = [
    'index,time,value,path',
    ...values.map((row) => [row.index, csvValue(row.time), csvValue(row.value), csvValue(path)].join(',')),
  ].join('\n');
  return deepFreeze({
    ...core,
    format: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    fileName: `${safeFileName(core.caseId)}-${safeFileName(path)}.csv`,
    content,
    contentHash: stableHash(content),
  });
}

export function explainNonlinearFailure(input = {}) {
  const error = input.error || input;
  const result = unwrapResult(input.result || input);
  const code = String(
    error.code
      || error.reason
      || result.reason
      || result.designBlockReason
      || 'NONLINEAR_RUN_FAILED',
  );
  const known = FAILURE_GUIDANCE[code] || inferredGuidance(code);
  return deepFreeze({
    version: NONLINEAR_RESULT_ACCESS_VERSION,
    code,
    title: known.title,
    message: error.message || result.message || known.message,
    failedStage: input.failedStage || known.stage,
    retryable: input.retryable ?? known.retryable,
    remediation: known.remediation.map((row) => ({ ...row })),
    technicalDetails: clone(error.details || result.details || null),
  });
}

function overviewSlice(wrapper, result, kind) {
  return {
    available: Boolean(result && Object.keys(result).length),
    status: wrapper.status || result.status || null,
    ok: wrapper.ok ?? result.ok ?? false,
    qualification: wrapper.qualification || result.qualification || null,
    designBlocked: wrapper.designBlocked === true || result.designBlocked === true,
    designBlockReason: wrapper.designBlockReason || result.designBlockReason || null,
    stale: wrapper.stale === true || result.stale === true,
    engine: clone(wrapper.engine || result.engine || null),
    summary: clone(wrapper.summary || result.summary || null),
    termination: clone(result.termination || null),
    failure: result.ok === false ? {code:result.reason||result.error?.code||'NONLINEAR_RUN_FAILED',
      cause:result.details?.callbackError?.code||null,message:String(result.message||'').slice(0,2000)} : null,
    warnings: clone(result.warnings || []),
    limitationCount: result.limitations?.length || 0,
    kind,
  };
}

function capacitySlice(result, query) {
  const rows = result.capacityCurve || result.steps || result.curve || [];
  const pagination = query.pageSize == null ? null : paginateNonlinearHistory(rows, query);
  const projectPoint = (row, index) => ({
    index,
    step: row.step ?? index,
    controlDisplacement: finite(row.controlDisplacement ?? row.displacement, 0),
    roofDisplacement: finite(row.roofDisplacement, null),
    baseShear: finite(row.baseShear, 0),
    lambda: finite(row.lambda ?? row.loadFactor, 0),
    yieldedHingeCount: finite(row.yieldedHingeCount ?? row.yielded, 0),
    cappingHingeCount: finite(row.cappingHingeCount, 0),
    failedHingeCount: finite(row.failedHingeCount, 0),
  });
  const points = (pagination?.rows || rows).map((row,index)=>projectPoint(row,index+(pagination?.offset||0)));
  const selectedIndex = clampIndex(query.step ?? query.index, rows.length);
  return {
    available: rows.length > 0,
    pointCount: rows.length,
    selectedIndex,
    selected: rows[selectedIndex] ? projectPoint(rows[selectedIndex],selectedIndex) : null,
    points,
    ...(pagination ? {pagination: {page:pagination.page,pageSize:pagination.pageSize,pageCount:pagination.pageCount,
      totalRows:pagination.totalRows,offset:pagination.offset,hasPrevious:pagination.hasPrevious,hasNext:pagination.hasNext}} : {}),
  };
}

function historySlice(result, query) {
  const rows = historyRows(result);
  const path = String(query.path || defaultHistoryPath(rows));
  const allPoints = rows.map((row, index) => ({
    index,
    x: finite(row.time, index),
    y: finite(readPath(row, path), null),
  })).filter((row) => Number.isFinite(row.y));
  const maxPoints = boundedInteger(query.maxPoints, 800, 4, 100000);
  const points = query.raw === true ? allPoints : downsampleNonlinearHistory(allPoints, { maxPoints });
  const page = paginateNonlinearHistory(points, query);
  return {
    available: rows.length > 0,
    path,
    rawRowCount: rows.length,
    plottedPointCount: points.length,
    downsampled: points.length < allPoints.length,
    algorithm: points.length < allPoints.length ? 'deterministic-min-max-buckets' : 'none',
    extrema: extrema(allPoints),
    ...page,
  };
}

function envelopeSlice(result, query) {
  const envelopes = result.history?.envelopes || result.historyEnvelope || {};
  const path = String(query.path || '');
  return {
    available: Boolean(envelopes && Object.keys(envelopes).length),
    path: path || null,
    value: path ? clone(readPath(envelopes, path)) : clone(envelopes),
  };
}

function storySlice(result, query) {
  const selected = selectedPushoverStep(result, query);
  const source = selected?.stories || result.storyResponse || result.integration?.stories || result.historyEnvelope?.stories || [];
  const rows = Array.isArray(source)
    ? source
    : Object.entries(source || {}).map(([id, value]) => ({ id, ...value }));
  const id = query.id || query.storyId;
  return {
    available: rows.length > 0,
    selectedId: id || null,
    selected: id ? clone(rows.find((row) => String(row.id || row.storyId) === String(id)) || null) : null,
    rows: clone(rows),
  };
}

function memberSlice(result, query) {
  const selected = selectedPushoverStep(result, query);
  const source = selected?.members || result.memberResults || result.integration?.members || result.historyEnvelope?.members || {};
  const rows = Array.isArray(source)
    ? source
    : Object.entries(source || {}).map(([id, value]) => ({ id, ...value }));
  const id = query.id || query.memberId;
  return {
    available: rows.length > 0,
    selectedId: id || null,
    selected: id ? clone(rows.find((row) => String(row.id || row.memberId) === String(id)) || null) : null,
    rows: clone(rows),
  };
}

function nodeSlice(result, query) {
  const selected = selectedPushoverStep(result, query);
  const source = selected?.integration?.nodes || result.integration?.nodes || result.nodes || {};
  const rows = Array.isArray(source)
    ? source
    : Object.entries(source || {}).map(([id, value]) => ({ id, ...value }));
  const id = query.id || query.nodeId;
  return {
    available: rows.length > 0,
    selectedId: id || null,
    selected: id ? clone(rows.find((row) => String(row.id || row.nodeId) === String(id)) || null) : null,
    rows: clone(rows),
  };
}

function hingeSlice(result, query) {
  const selected = selectedPushoverStep(result, query);
  const rows = selected?.hinges || result.hingeResults || result.integration?.hinges || [];
  const id = query.id || query.hingeId;
  return {
    available: rows.length > 0,
    selectedId: id || null,
    selected: id ? clone(rows.find((row) => String(row.id || row.hingeId) === String(id)) || null) : null,
    stateCounts: countBy(rows, (row) => row.state || 'unknown'),
    rows: clone(rows),
  };
}

function convergenceSlice(result, query) {
  const step = selectedPushoverStep(result, query);
  const dynamicRows = historyRows(result).map((row, index) => ({
    index,
    time: row.time ?? index,
    ...clone(row.convergence || {}),
  })).filter((row) => Object.keys(row).length > 2);
  return {
    available: Boolean(step?.convergence || dynamicRows.length || result.convergence),
    selected: clone(step?.convergence || result.convergence || null),
    rows: dynamicRows,
    rejectedSteps: clone(result.control?.rejectedSteps || result.details?.rejectedSteps || []),
  };
}

function provenanceSlice(wrapper, result) {
  return {
    available: Boolean(wrapper.runRecordId || result.runRecord || result.provenance),
    runRecordId: wrapper.runRecordId || result.runRecord?.id || null,
    stale: wrapper.stale === true || result.stale === true,
    settings: clone(wrapper.settings || null),
    settingsHash: wrapper.settingsHash || (wrapper.settings ? stableHash(wrapper.settings).slice(0, 24) : null),
    provenance: clone(wrapper.provenance || result.provenance || null),
    dependencies: clone(result.dependencies || null),
    runRecord: clone(result.runRecord || null),
    routing: clone(wrapper.routing || result.routing || null),
  };
}

function historyRows(result) {
  const chunks = result.history?.retainedChunks || result.details?.history?.retainedChunks || [];
  if (chunks.length) return chunks.flatMap((chunk) => chunk.rows || []);
  if (Array.isArray(result.rows)) return result.rows;
  if (Array.isArray(result.history?.rows)) return result.history.rows;
  return [];
}

function selectedPushoverStep(result, query) {
  const rows = result.capacityCurve || result.steps || [];
  return rows[clampIndex(query.step ?? query.index, rows.length)] || rows.at(-1) || null;
}

function defaultHistoryPath(rows) {
  const first = rows?.[0] || {};
  if (Array.isArray(first.q) && first.q.length) return 'q[0]';
  if (first.energies?.input != null) return 'energies.input';
  if (first.baseReactionForce?.[0] != null) return 'baseReactionForce[0]';
  return 'time';
}

function defaultSlice(kind) {
  return kind === 'pushover' ? 'capacity' : kind === 'nlth' ? 'history' : 'overview';
}

function unwrapResult(input) {
  return input?.payload && typeof input.payload === 'object' ? input.payload : input || {};
}

function resultKind(wrapper, result) {
  const kind = String(wrapper.kind || result.kind || '').toLowerCase();
  if (kind.includes('timehistory') || kind.includes('time-history') || kind === 'nlth') return 'nlth';
  if (result.history?.retainedChunks || result.groundMotion) return 'nlth';
  if (result.capacityCurve || result.curve) return 'pushover';
  return kind || 'nonlinear';
}

function readPath(value, path) {
  if (!path) return value;
  const keys = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = value;
  for (const key of keys) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}

function normalizePoint(row, index) {
  if (Array.isArray(row)) return { index, x: finite(row[0], index), y: finite(row[1], null) };
  return {
    ...clone(row),
    index: Number.isInteger(row?.index) ? row.index : index,
    x: finite(row?.x ?? row?.time, index),
    y: finite(row?.y ?? row?.value, null),
  };
}

function retainGlobalExtrema(points, maxPoints) {
  const required = new Set([0, points.length - 1]);
  let minIndex = 0;
  let maxIndex = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].y < points[minIndex].y) minIndex = index;
    if (points[index].y > points[maxIndex].y) maxIndex = index;
  }
  required.add(minIndex);
  required.add(maxIndex);
  const remaining = maxPoints - required.size;
  for (let index = 0; index < remaining; index += 1) {
    required.add(Math.round((index * (points.length - 1)) / Math.max(1, remaining - 1)));
  }
  return [...required].sort((a, b) => a - b).slice(0, maxPoints).map((index) => points[index]);
}

function extrema(points) {
  const values = points.filter((row) => Number.isFinite(row.y));
  if (!values.length) return { minimum: null, maximum: null };
  return {
    minimum: clone(values.reduce((best, row) => row.y < best.y ? row : best, values[0])),
    maximum: clone(values.reduce((best, row) => row.y > best.y ? row : best, values[0])),
  };
}

function countBy(rows, keyOf) {
  const output = {};
  for (const row of rows || []) {
    const key = String(keyOf(row));
    output[key] = (output[key] || 0) + 1;
  }
  return output;
}

function inferredGuidance(code) {
  if (code.includes('MEMORY')) return FAILURE_GUIDANCE.PREFLIGHT_MEMORY_LIMIT_EXCEEDED;
  if (code.includes('CONVERG') || code.includes('ITERATION') || code.includes('MINIMUM')) return FAILURE_GUIDANCE.NONLINEAR_NONCONVERGENCE;
  if (code.includes('MASS')) return FAILURE_GUIDANCE.NLTH_MASS_SOURCE_REQUIRED;
  if (code.includes('GROUND') || code.includes('TIME_HISTORY')) return FAILURE_GUIDANCE.NLTH_GROUND_MOTION_REQUIRED;
  if (code.includes('WORKER') || code.includes('BACKEND') || code.includes('WASM')) return FAILURE_GUIDANCE.PRODUCTION_BACKEND_UNAVAILABLE;
  return {
    title: '비선형해석 실행 실패',
    message: '실패 코드와 마지막 수렴 기록을 확인한 뒤 입력 또는 해 제어를 수정하세요.',
    stage: 'run',
    retryable: true,
    remediation: [{ action: 'open-failure-details', label: '실패 상세 확인' }],
  };
}

const FAILURE_GUIDANCE = Object.freeze({
  NONLINEAR_PROPERTY_ASSIGNMENT_REQUIRED: {
    title: '비선형 속성 미배정',
    message: '해석 대상 부재에 힌지 또는 fiber 단면이 없습니다.',
    stage: 'properties', retryable: false,
    remediation: [{ action: 'preview-auto-assignment', label: '자동 배정 미리보기' }],
  },
  NLTH_MASS_SOURCE_REQUIRED: {
    title: '질량원 필요',
    message: '3D 모델과 결속된 명시적 질량원이 필요합니다.',
    stage: 'groundMotion', retryable: false,
    remediation: [{ action: 'open-load-mass-editor', label: '하중·질량 편집' }],
  },
  NLTH_GROUND_MOTION_REQUIRED: {
    title: '지진파 필요',
    message: '가속도 값, 시간간격, 단위와 방향을 입력하세요.',
    stage: 'groundMotion', retryable: false,
    remediation: [{ action: 'edit-ground-motion', label: '지진파 입력' }],
  },
  PREFLIGHT_MEMORY_LIMIT_EXCEEDED: {
    title: '예상 메모리 초과',
    message: '출력 간격, 저장 이력 또는 모델 크기를 조정해야 합니다.',
    stage: 'run', retryable: false,
    remediation: [{ action: 'reduce-output-history', label: '출력량 줄이기' }],
  },
  PRODUCTION_BACKEND_UNAVAILABLE: {
    title: 'Production backend 없음',
    message: 'Worker와 자체 WASM 희소행렬 backend가 준비되지 않았습니다. Reference solver로 자동 대체하지 않습니다.',
    stage: 'run', retryable: true,
    remediation: [{ action: 'inspect-runtime', label: '실행환경 확인' }],
  },
  NONLINEAR_NONCONVERGENCE: {
    title: '평형 반복 미수렴',
    message: '마지막 수렴 스텝은 보존되었으며 증분, 허용오차, 힌지 속성과 모델 안정성을 검토해야 합니다.',
    stage: 'run', retryable: true,
    remediation: [
      { action: 'inspect-convergence', label: '수렴 이력 확인' },
      { action: 'reduce-step-size', label: '증분 축소' },
    ],
  },
});

function sanitizeQuery(query) {
  return Object.fromEntries(Object.entries(query || {}).filter(([, value]) => (
    value == null || ['string', 'number', 'boolean'].includes(typeof value)
  )));
}

function safeFileName(value) {
  return String(value || 'result').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '') || 'result';
}

function csvValue(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function clampIndex(value, length) {
  if (!length) return 0;
  const index = Math.trunc(Number(value));
  return Number.isFinite(index) ? Math.max(0, Math.min(length - 1, index)) : length - 1;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
