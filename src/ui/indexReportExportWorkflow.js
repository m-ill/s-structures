import { stableHash } from '../core/stableHash.js';

export const P11_REPORT_EXPORT_WORKFLOW_VERSION = 'p11-product-report-export-workflow-v1';
export const P11_REPORT_EXPORT_ACTIONS = Object.freeze([
  'preflightReportExport',
  'planReportExport',
  'runReportExport',
  'getReportExportStatus',
  'cancelReportExport',
  'listReportExports',
  'getReportExportArtifacts',
  'openReportExportArtifact',
]);

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const REMEDIATION = Object.freeze({
  P11_REPORT_EXPORT_ADAPTER_UNAVAILABLE: '데스크톱 앱에서 다시 시도하거나 한·영 print-ready HTML을 수동 인쇄하세요.',
  P11_REPORT_EXPORT_SNAPSHOT_STALE: '모델을 다시 해석하고 보고서 snapshot과 화면 증거를 새로 생성하세요.',
  P11_REPORT_EXPORT_FIGURES_INCOMPLETE: '필수 7개 화면 증거를 다시 캡처하세요.',
  P11_PDF_EXPORT_CANCELLED: '취소된 작업은 산출물을 게시하지 않습니다. 필요하면 새 작업을 시작하세요.',
  P11_PDF_EXPORT_TIMEOUT: '출력 장치 상태와 디스크 여유 공간을 확인한 뒤 다시 시도하세요.',
  P11_PDF_INSPECTION_FAILED: 'PDF 품질 검사 항목을 확인하고 보고서를 다시 생성하세요.',
});

export function createReportExportWorkflow(options = {}) {
  const transport = options.transport;
  const jobs = new Map();
  const idempotency = new Map();
  const listeners = new Set();
  return Object.freeze({
    version: P11_REPORT_EXPORT_WORKFLOW_VERSION,
    preflight,
    plan,
    run,
    status,
    cancel,
    list,
    refreshHistory,
    artifacts,
    openArtifact,
    browserFallback,
    subscribe,
  });

  function preflight(input = {}) {
    const issues = [];
    if (!transport?.plan || !transport?.run || !transport?.status || !transport?.cancel) {
      issues.push(issue('P11_REPORT_EXPORT_ADAPTER_UNAVAILABLE'));
    }
    if (!/^[a-f0-9]{64}$/u.test(input.snapshot?.reportSnapshotHash || '')) {
      issues.push(issue('P11_REPORT_EXPORT_SNAPSHOT_INVALID'));
    }
    if (input.currentReportSnapshotHash
      && input.currentReportSnapshotHash !== input.snapshot?.reportSnapshotHash) {
      issues.push(issue('P11_REPORT_EXPORT_SNAPSHOT_STALE'));
    }
    if (input.figureManifest?.status !== 'complete'
      || input.figureManifest?.reportSnapshotHash !== input.snapshot?.reportSnapshotHash
      || input.figureManifest?.figureCount !== 7) {
      issues.push(issue('P11_REPORT_EXPORT_FIGURES_INCOMPLETE'));
    }
    return Object.freeze({
      version: P11_REPORT_EXPORT_WORKFLOW_VERSION,
      ready: issues.length === 0,
      reportSnapshotHash: input.snapshot?.reportSnapshotHash || null,
      figureManifestHash: input.figureManifest?.figureManifestHash || null,
      verdict: input.snapshot?.verdict?.overall || null,
      sceneCoverage: input.figureManifest?.figureCount || 0,
      issues,
      browserFallbackAvailable: !!input.reports?.['ko-KR'] && !!input.reports?.['en-US'],
    });
  }

  async function plan(input = {}) {
    const readiness = preflight(input);
    if (!readiness.ready) throw workflowError(readiness.issues[0].code, readiness.issues[0].message);
    const requestKey = stableHash({
      projectId: input.projectId,
      reportSnapshotHash: readiness.reportSnapshotHash,
      figureManifestHash: readiness.figureManifestHash,
      sourceRevision: input.sourceRevision || null,
    });
    const existingId = idempotency.get(requestKey);
    if (existingId && jobs.has(existingId)) return snapshot(jobs.get(existingId));
    const remote = await transport.plan(input);
    if (remote.reportSnapshotHash !== readiness.reportSnapshotHash || !remote.planHash) {
      throw workflowError('P11_REPORT_EXPORT_PLAN_PARITY_FAILED', 'Export service returned a different snapshot or no plan hash.');
    }
    const row = {
      ...remote,
      requestKey,
      source: input.source || 'ui',
      projectId: input.projectId,
      createdAt: new Date(options.now?.() ?? Date.now()).toISOString(),
      updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
      preflight: readiness,
      error: null,
    };
    jobs.set(row.jobId, row);
    idempotency.set(requestKey, row.jobId);
    emit(row, 'planned');
    return snapshot(row);
  }

  async function run(input) {
    const jobId = idOf(input);
    const row = requireJob(jobId);
    if (row.status === 'completed') return snapshot(row);
    row.status = 'running';
    row.stage = 'starting';
    row.updatedAt = new Date(options.now?.() ?? Date.now()).toISOString();
    emit(row, 'running');
    try {
      const remote = await transport.run(jobId);
      if (remote.planHash !== row.planHash || remote.reportSnapshotHash !== row.reportSnapshotHash) {
        throw workflowError('P11_REPORT_EXPORT_RESULT_PARITY_FAILED', 'Completed export does not match its plan.');
      }
      Object.assign(row, remote, { updatedAt: new Date(options.now?.() ?? Date.now()).toISOString() });
      emit(row, remote.status || 'completed');
      return snapshot(row);
    } catch (error) {
      row.status = error?.code === 'P11_PDF_EXPORT_CANCELLED' ? 'cancelled' : 'failed';
      row.stage = row.status;
      row.error = issue(error?.code || 'P11_REPORT_EXPORT_FAILED', error?.message);
      row.updatedAt = new Date(options.now?.() ?? Date.now()).toISOString();
      emit(row, row.status);
      throw error;
    }
  }

  async function status(input) {
    const row = requireJob(idOf(input));
    if (!TERMINAL.has(row.status)) {
      const remote = await transport.status(row.jobId);
      if (remote.planHash !== row.planHash || remote.reportSnapshotHash !== row.reportSnapshotHash) {
        throw workflowError('P11_REPORT_EXPORT_STATUS_PARITY_FAILED', 'Export status does not match its plan.');
      }
      Object.assign(row, remote, { updatedAt: new Date(options.now?.() ?? Date.now()).toISOString() });
      emit(row, 'status');
    }
    return snapshot(row);
  }

  async function cancel(input) {
    const row = requireJob(idOf(input));
    const startedAt = performanceNow();
    const remote = await transport.cancel(row.jobId);
    Object.assign(row, remote, {
      cancelAcknowledgementMs: performanceNow() - startedAt,
      updatedAt: new Date(options.now?.() ?? Date.now()).toISOString(),
    });
    emit(row, 'cancel-acknowledged');
    return snapshot(row);
  }

  function list(filter = {}) {
    return [...jobs.values()]
      .filter((row) => !filter.projectId || row.projectId === filter.projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(snapshot);
  }

  async function refreshHistory(filter = {}) {
    if (typeof transport?.list !== 'function') return list(filter);
    const published = await transport.list(filter);
    for (const remote of published || []) {
      const existing = jobs.get(remote.jobId);
      const row = existing || {
        ...remote,
        source: 'published-history',
        requestKey: null,
        preflight: null,
      };
      Object.assign(row, remote);
      jobs.set(row.jobId, row);
    }
    return list(filter);
  }

  function artifacts(input) {
    const row = requireJob(idOf(input));
    if (row.status !== 'completed' || !row.artifacts) {
      throw workflowError('P11_REPORT_EXPORT_ARTIFACTS_NOT_READY', 'Report artifacts are not ready.');
    }
    return Object.freeze({
      jobId: row.jobId,
      planHash: row.planHash,
      reportSnapshotHash: row.reportSnapshotHash,
      manifestPath: row.manifestPath,
      locales: Object.freeze({ ...row.artifacts }),
    });
  }

  async function openArtifact(input = {}) {
    const locale = input.locale;
    if (!['ko-KR', 'en-US'].includes(locale)) {
      throw workflowError('P11_REPORT_EXPORT_LOCALE_INVALID', 'Artifact locale must be ko-KR or en-US.');
    }
    const artifactSet = artifacts(input);
    const artifact = artifactSet.locales[locale];
    if (!artifact?.pdf) throw workflowError('P11_REPORT_EXPORT_ARTIFACT_NOT_FOUND', 'PDF artifact is missing.');
    if (typeof options.openArtifact !== 'function') {
      throw workflowError('P11_REPORT_EXPORT_OPEN_UNAVAILABLE', 'Artifact open adapter is unavailable.');
    }
    await options.openArtifact({ ...artifact, locale, manifestPath: artifactSet.manifestPath });
    return artifact;
  }

  function browserFallback(input = {}) {
    if (!input.reports?.['ko-KR'] || !input.reports?.['en-US']) {
      throw workflowError('P11_REPORT_EXPORT_FALLBACK_UNAVAILABLE', 'Bilingual print-ready HTML is unavailable.');
    }
    return Object.freeze({
      mode: 'manual-print-ready',
      silentPdfSaved: false,
      locales: Object.freeze({
        'ko-KR': input.reports['ko-KR'].html,
        'en-US': input.reports['en-US'].html,
      }),
      notice: '브라우저는 PDF 자동 저장 성공을 보장하지 않습니다. 각 언어 문서를 수동 인쇄하세요.',
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(row, event) {
    const value = snapshot(row);
    for (const listener of listeners) listener(value, event);
  }

  function requireJob(jobId) {
    const row = jobs.get(jobId);
    if (!row) throw workflowError('P11_REPORT_EXPORT_JOB_NOT_FOUND', 'Report export job was not found.');
    return row;
  }
}

export function buildReportExportView(job = null, history = [], preflight = null) {
  return Object.freeze({
    version: P11_REPORT_EXPORT_WORKFLOW_VERSION,
    title: '한·영 보고서 내보내기',
    status: job?.status || (preflight?.ready ? 'ready' : 'not-ready'),
    stage: job?.stage || null,
    progress: Number(job?.progress || 0),
    canRun: preflight?.ready === true && (!job || job.status === 'planned'),
    canCancel: !!job && ['planned', 'running', 'cancelling'].includes(job.status),
    canOpen: job?.status === 'completed' && !!job.artifacts,
    reason: job?.error || preflight?.issues?.[0] || null,
    historyCount: history.length,
    snapshotHash: job?.reportSnapshotHash || preflight?.reportSnapshotHash || null,
    planHash: job?.planHash || null,
  });
}

export function installReportExportUi(target, workflow, inputProvider) {
  const doc = target?.document;
  const menu = doc?.getElementById?.('menuDrop');
  if (!doc?.createElement || !menu?.appendChild || !workflow) return null;
  let button = doc.getElementById?.('mBilingualReportExport');
  if (!button) {
    button = doc.createElement('button');
    button.id = 'mBilingualReportExport';
    button.type = 'button';
    button.textContent = '한·영 보고서 내보내기';
    menu.appendChild(button);
  }
  button.setAttribute?.('data-agent-id', 'mBilingualReportExport');
  button.setAttribute?.('aria-label', '한국어 및 영어 PDF 보고서 내보내기');
  button.addEventListener?.('click', async () => {
    try {
      const input = await inputProvider?.();
      const readiness = workflow.preflight(input);
      target.SStructuresReportExportView = buildReportExportView(null, workflow.list(), readiness);
      if (!readiness.ready) return;
      const planned = await workflow.plan({ ...input, source: 'ui' });
      target.SStructuresReportExportView = buildReportExportView(planned, workflow.list(), readiness);
      const completed = await workflow.run(planned.jobId);
      target.SStructuresReportExportView = buildReportExportView(completed, workflow.list(), readiness);
    } catch (error) {
      target.SStructuresReportExportView = Object.freeze({
        ...buildReportExportView(null, workflow.list(), null),
        status: 'failed',
        reason: issue(error?.code || 'P11_REPORT_EXPORT_FAILED', error?.message),
      });
    }
  });
  return Object.freeze({
    version: P11_REPORT_EXPORT_WORKFLOW_VERSION,
    controlId: 'mBilingualReportExport',
  });
}

function snapshot(row) {
  return Object.freeze({
    version: P11_REPORT_EXPORT_WORKFLOW_VERSION,
    jobId: row.jobId,
    projectId: row.projectId || null,
    source: row.source || null,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress || 0),
    planHash: row.planHash,
    reportSnapshotHash: row.reportSnapshotHash,
    artifacts: row.artifacts ? Object.freeze({ ...row.artifacts }) : null,
    manifestPath: row.manifestPath || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelAcknowledgementMs: row.cancelAcknowledgementMs ?? null,
    error: row.error ? Object.freeze({ ...row.error }) : null,
  });
}

function issue(code, message = null) {
  return Object.freeze({
    code,
    message: message || code.replaceAll('_', ' ').toLowerCase(),
    remediation: REMEDIATION[code] || '실패 사유를 확인하고 입력 또는 실행 환경을 수정한 뒤 다시 시도하세요.',
  });
}

function idOf(input) {
  return String(typeof input === 'string' ? input : input?.jobId || input?.id || '');
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function workflowError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
