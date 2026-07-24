import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stableHash } from '../../../src/core/stableHash.js';
import { renderProductionReportPair } from '../../../src/report/phase11/productionReport.js';

export const P11_PDF_EXPORT_PLAN_VERSION = 'p11-dual-pdf-export-plan-v1';
export const P11_PDF_ARTIFACT_MANIFEST_VERSION = 'p11-report-artifact-manifest-v1';
export const P11_PDF_EXPORT_JOB_VERSION = 'p11-pdf-export-job-v1';
export const P11_PDF_EXPORT_LOCALES = Object.freeze(['ko-KR', 'en-US']);
export const P11_PDF_EXPORT_TERMINAL_STATES = Object.freeze(['completed', 'failed', 'cancelled']);

const FILES = Object.freeze({
  'ko-KR': Object.freeze({ html: 'report-ko.html', pdf: 'report-ko.pdf' }),
  'en-US': Object.freeze({ html: 'report-en.html', pdf: 'report-en.pdf' }),
});
const FORBIDDEN_TEXT = Object.freeze([
  /file:\/{2,3}/iu,
  /[a-z]:\\users\\/iu,
  /\/users\/[^/\s]+/iu,
  /\bbearer\s+[a-z0-9._~-]+/iu,
  /\bsk-[a-z0-9_-]{8,}/iu,
  /\bcodex(?:_home|\/|\\)/iu,
]);

export function createDualPdfExportPlan(input = {}) {
  const projectId = safeSegment(input.projectId || input.snapshot?.project?.id, 'P11_PDF_PROJECT_ID_INVALID');
  const pair = renderProductionReportPair(input.snapshot, {
    projectName: input.projectName || projectId,
    figureManifest: input.figureManifest,
  });
  const core = {
    version: P11_PDF_EXPORT_PLAN_VERSION,
    projectId,
    projectName: String(input.projectName || projectId),
    sourceRevision: clean(input.sourceRevision) || null,
    reportSnapshotHash: input.snapshot.reportSnapshotHash,
    figureManifestHash: input.figureManifest.figureManifestHash,
    evidenceManifestHash: clean(input.evidenceManifestHash) || null,
    pairHash: pair.manifest.pairHash,
    pageCount: pair.manifest.pageCount,
    locales: [...P11_PDF_EXPORT_LOCALES],
  };
  return Object.freeze({
    ...core,
    planHash: stableHash(core),
    reports: pair.reports,
    figureManifest: input.figureManifest,
    assetSourceRoot: input.assetSourceRoot ? path.resolve(input.assetSourceRoot) : null,
  });
}

export async function exportDualPdfPair(plan, options = {}) {
  validatePlan(plan);
  const adapter = options.adapter;
  const inspectPdf = options.inspectPdf;
  if (!adapter?.render || typeof inspectPdf !== 'function') {
    throw exportError('P11_PDF_ADAPTER_INVALID', 'A PDF adapter and inspector are required.');
  }
  const outputRoot = requireAbsoluteRoot(options.outputRoot, 'P11_PDF_OUTPUT_ROOT_INVALID');
  const tempRoot = requireAbsoluteRoot(options.tempRoot, 'P11_PDF_TEMP_ROOT_INVALID');
  const jobId = safeSegment(options.jobId || randomUUID(), 'P11_PDF_JOB_ID_INVALID');
  const finalDir = inside(outputRoot, path.join(outputRoot, plan.projectId, jobId), 'P11_PDF_OUTPUT_PATH_INVALID');
  const stagingDir = inside(tempRoot, path.join(tempRoot, `${jobId}.staging`), 'P11_PDF_TEMP_PATH_INVALID');
  const signal = options.signal;
  const startedAt = Date.now();
  const emit = (stage, progress) => options.onProgress?.(Object.freeze({ jobId, stage, progress }));
  let published = false;
  await assertMissing(finalDir, 'P11_PDF_FINAL_ALREADY_EXISTS');
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  try {
    checkCancelled(signal);
    emit('staging', 0.05);
    await stageAssets(plan, stagingDir);
    const artifacts = {};
    for (const [index, locale] of P11_PDF_EXPORT_LOCALES.entries()) {
      checkCancelled(signal);
      const files = FILES[locale];
      const html = plan.reports[locale].html;
      assertPrivateTextAbsent(html, 'P11_PDF_HTML_PRIVACY_FAILED');
      const htmlPath = path.join(stagingDir, files.html);
      await writeFile(htmlPath, html, 'utf8');
      emit(`rendering:${locale}`, 0.15 + index * 0.3);
      const rendered = await withTimeout(
        adapter.render({
          locale,
          htmlPath,
          expectedPageCount: plan.pageCount,
          reportSnapshotHash: plan.reportSnapshotHash,
          signal,
        }),
        options.timeoutMs || 60_000,
        signal,
      );
      checkCancelled(signal);
      const bytes = Buffer.from(rendered?.bytes ?? rendered ?? []);
      assertPdfSignature(bytes);
      if (bytes.length > (options.maxPdfBytes || 25 * 1024 * 1024)) {
        throw exportError('P11_PDF_SIZE_LIMIT_EXCEEDED', `${locale} PDF exceeds the configured size limit.`);
      }
      const inspection = await inspectPdf(bytes, {
        locale,
        expectedPageCount: plan.pageCount,
        reportSnapshotHash: plan.reportSnapshotHash,
      });
      validateInspection(inspection, locale, plan.pageCount);
      assertPrivateTextAbsent(inspection.text || '', 'P11_PDF_TEXT_PRIVACY_FAILED');
      await writeFile(path.join(stagingDir, files.pdf), bytes);
      artifacts[locale] = Object.freeze({
        locale,
        html: files.html,
        pdf: files.pdf,
        sha256: sha256(bytes),
        pages: inspection.pageCount,
        bytes: bytes.length,
        metadata: Object.freeze({
          title: clean(inspection.metadata?.title) || null,
          author: clean(inspection.metadata?.author) || null,
          creator: clean(inspection.metadata?.creator) || null,
          producer: clean(inspection.metadata?.producer) || null,
        }),
        qualification: Object.freeze({
          a4: inspection.a4 === true,
          searchableText: inspection.searchableText === true,
          fontsEmbedded: inspection.fontsEmbedded === true,
          footer: inspection.footer === true,
          privacyFindings: 0,
        }),
      });
      emit(`validated:${locale}`, 0.4 + index * 0.3);
    }
    checkCancelled(signal);
    const generatedAt = new Date(options.now?.() ?? Date.now()).toISOString();
    const core = {
      version: P11_PDF_ARTIFACT_MANIFEST_VERSION,
      status: 'complete',
      jobId,
      projectId: plan.projectId,
      generatedAt,
      durationMs: Date.now() - startedAt,
      sourceRevision: plan.sourceRevision,
      planHash: plan.planHash,
      reportSnapshotHash: plan.reportSnapshotHash,
      figureManifestHash: plan.figureManifestHash,
      evidenceManifestHash: plan.evidenceManifestHash,
      reportSchema: plan.reports['ko-KR'].layoutVersion,
      pairHash: plan.pairHash,
      locales: [...P11_PDF_EXPORT_LOCALES],
      artifacts,
      qualification: {
        pairComplete: true,
        pageParity: artifacts['ko-KR'].pages === artifacts['en-US'].pages,
        partialArtifacts: 0,
        privacyFindings: 0,
      },
    };
    const manifest = Object.freeze({ ...core, manifestHash: stableHash(core) });
    await writeFile(path.join(stagingDir, 'artifact-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await mkdir(path.dirname(finalDir), { recursive: true });
    checkCancelled(signal);
    emit('publishing', 0.95);
    await rename(stagingDir, finalDir);
    published = true;
    emit('completed', 1);
    return Object.freeze({
      manifest,
      finalDir,
      manifestPath: path.join(finalDir, 'artifact-manifest.json'),
    });
  } catch (error) {
    if (signal?.aborted && error?.code !== 'P11_PDF_EXPORT_CANCELLED') {
      throw exportError('P11_PDF_EXPORT_CANCELLED', 'PDF export was cancelled.', { cause: error });
    }
    throw error;
  } finally {
    if (!published) await rm(stagingDir, { recursive: true, force: true });
    await adapter.dispose?.();
  }
}

export function createPdfExportService(options = {}) {
  const jobs = new Map();
  return Object.freeze({ plan, run, status, cancel, list, listPublished });

  function plan(input) {
    const exportPlan = createDualPdfExportPlan({
      ...input,
      assetSourceRoot: input.assetSourceRoot || options.assetSourceRoot,
    });
    const jobId = safeSegment(input.jobId || randomUUID(), 'P11_PDF_JOB_ID_INVALID');
    if (jobs.has(jobId)) throw exportError('P11_PDF_JOB_EXISTS', 'PDF export job already exists.');
    const job = {
      version: P11_PDF_EXPORT_JOB_VERSION,
      jobId,
      status: 'planned',
      stage: 'planned',
      progress: 0,
      planHash: exportPlan.planHash,
      reportSnapshotHash: exportPlan.reportSnapshotHash,
      plan: exportPlan,
      controller: new AbortController(),
      result: null,
      error: null,
      promise: null,
    };
    jobs.set(jobId, job);
    return snapshot(job);
  }

  async function run(jobId) {
    const job = requireJob(jobId);
    if (job.status !== 'planned') throw exportError('P11_PDF_JOB_NOT_RUNNABLE', 'Only a planned job can run.');
    job.status = 'running';
    job.stage = 'staging';
    job.promise = exportDualPdfPair(job.plan, {
      ...options,
      jobId: job.jobId,
      signal: job.controller.signal,
      onProgress(event) {
        job.stage = event.stage;
        job.progress = event.progress;
        options.onProgress?.(event);
      },
    });
    try {
      job.result = await job.promise;
      job.status = 'completed';
      return snapshot(job);
    } catch (error) {
      job.error = { code: error?.code || 'P11_PDF_EXPORT_FAILED', message: error?.message || String(error) };
      job.status = error?.code === 'P11_PDF_EXPORT_CANCELLED' ? 'cancelled' : 'failed';
      job.stage = job.status;
      throw error;
    }
  }

  function status(jobId) {
    return snapshot(requireJob(jobId));
  }

  function cancel(jobId) {
    const job = requireJob(jobId);
    if (P11_PDF_EXPORT_TERMINAL_STATES.includes(job.status)) return snapshot(job);
    job.controller.abort();
    job.stage = 'cancelling';
    return snapshot(job);
  }

  function list() {
    return [...jobs.values()].map(snapshot);
  }

  async function listPublished(filter = {}) {
    const outputRoot = requireAbsoluteRoot(options.outputRoot, 'P11_PDF_OUTPUT_ROOT_INVALID');
    const requestedProject = filter.projectId ? safeSegment(filter.projectId, 'P11_PDF_PROJECT_ID_INVALID') : null;
    const projectIds = requestedProject ? [requestedProject] : await directoryNames(outputRoot);
    const rows = [];
    for (const projectId of projectIds) {
      const projectRoot = inside(outputRoot, path.join(outputRoot, projectId), 'P11_PDF_OUTPUT_PATH_INVALID');
      for (const jobId of await directoryNames(projectRoot)) {
        const manifestPath = path.join(projectRoot, jobId, 'artifact-manifest.json');
        const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
        if (!manifest || !validateArtifactManifest(manifest).ok) continue;
        rows.push(Object.freeze({
          version: P11_PDF_EXPORT_JOB_VERSION,
          jobId: manifest.jobId,
          projectId: manifest.projectId,
          status: 'completed',
          stage: 'completed',
          progress: 1,
          planHash: manifest.planHash,
          reportSnapshotHash: manifest.reportSnapshotHash,
          artifacts: manifest.artifacts,
          manifestPath,
          createdAt: manifest.generatedAt,
          updatedAt: manifest.generatedAt,
          error: null,
        }));
      }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function requireJob(jobId) {
    const job = jobs.get(String(jobId));
    if (!job) throw exportError('P11_PDF_JOB_NOT_FOUND', 'PDF export job was not found.');
    return job;
  }
}

export function validateArtifactManifest(value) {
  const errors = [];
  if (value?.version !== P11_PDF_ARTIFACT_MANIFEST_VERSION) errors.push('version');
  if (value?.status !== 'complete') errors.push('status');
  if (JSON.stringify(value?.locales) !== JSON.stringify(P11_PDF_EXPORT_LOCALES)) errors.push('locales');
  for (const locale of P11_PDF_EXPORT_LOCALES) {
    const row = value?.artifacts?.[locale];
    if (row?.locale !== locale || !/^[a-f0-9]{64}$/u.test(row?.sha256 || '') || !(row?.bytes > 0) || !(row?.pages > 0)) {
      errors.push(`artifact:${locale}`);
    }
  }
  if (value?.qualification?.pairComplete !== true || value?.qualification?.pageParity !== true) errors.push('qualification');
  const { manifestHash, ...core } = value || {};
  if (!manifestHash || stableHash(core) !== manifestHash) errors.push('manifestHash');
  return { ok: errors.length === 0, errors };
}

async function stageAssets(plan, stagingDir) {
  const figures = plan.figureManifest?.figures || [];
  if (!figures.length) return;
  if (!plan.assetSourceRoot) throw exportError('P11_PDF_ASSET_ROOT_REQUIRED', 'Figure assets require an asset source root.');
  for (const figure of figures) {
    const source = inside(plan.assetSourceRoot, path.resolve(plan.assetSourceRoot, figure.assetPath), 'P11_PDF_ASSET_PATH_INVALID');
    const bytes = await readFile(source);
    if (sha256(bytes) !== figure.sha256) throw exportError('P11_PDF_ASSET_HASH_MISMATCH', `Figure asset hash mismatch: ${figure.figureId}`);
    const target = inside(stagingDir, path.resolve(stagingDir, figure.assetPath), 'P11_PDF_ASSET_PATH_INVALID');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

function validatePlan(plan) {
  if (plan?.version !== P11_PDF_EXPORT_PLAN_VERSION || !/^[a-f0-9]{64}$/u.test(plan?.planHash || '')) {
    throw exportError('P11_PDF_PLAN_INVALID', 'PDF export plan is invalid.');
  }
  const { reports, figureManifest, assetSourceRoot, planHash, ...core } = plan;
  if (stableHash(core) !== planHash) throw exportError('P11_PDF_PLAN_INVALID', 'PDF export plan hash does not match.');
}

function validateInspection(row, locale, expectedPages) {
  const metadataTitle = clean(row?.metadata?.title);
  const ok = row?.pageCount === expectedPages
    && row?.a4 === true
    && row?.searchableText === true
    && row?.fontsEmbedded === true
    && row?.footer === true
    && Number(row?.privacyFindings || 0) === 0
    && metadataTitle.length > 0
    && !metadataTitle.includes('\uFFFD');
  if (!ok) throw exportError('P11_PDF_INSPECTION_FAILED', `${locale} PDF inspection failed.`);
}

function snapshot(job) {
  return Object.freeze({
    version: job.version,
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    planHash: job.planHash,
    reportSnapshotHash: job.reportSnapshotHash,
    artifacts: job.result?.manifest?.artifacts || null,
    manifestPath: job.result?.manifestPath || null,
    error: job.error,
  });
}

function assertPdfSignature(bytes) {
  if (bytes.length < 64 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw exportError('P11_PDF_BYTES_INVALID', 'Adapter did not return a PDF document.');
  }
}

function assertPrivateTextAbsent(text, code) {
  if (FORBIDDEN_TEXT.some((pattern) => pattern.test(String(text)))) {
    throw exportError(code, 'Report contains a forbidden private-path or secret marker.');
  }
}

function checkCancelled(signal) {
  if (signal?.aborted) throw exportError('P11_PDF_EXPORT_CANCELLED', 'PDF export was cancelled.');
}

async function withTimeout(promise, timeoutMs, signal) {
  let timer;
  let abortHandler;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(exportError('P11_PDF_EXPORT_TIMEOUT', 'PDF adapter timed out.')), timeoutMs);
  });
  const aborted = new Promise((_resolve, reject) => {
    if (!signal) return;
    abortHandler = () => reject(exportError('P11_PDF_EXPORT_CANCELLED', 'PDF export was cancelled.'));
    signal.addEventListener('abort', abortHandler, { once: true });
  });
  try {
    checkCancelled(signal);
    return await Promise.race([Promise.resolve(promise), timeout, aborted]);
  } finally {
    clearTimeout(timer);
    if (abortHandler) signal.removeEventListener('abort', abortHandler);
  }
}

function requireAbsoluteRoot(value, code) {
  if (!value || !path.isAbsolute(value)) throw exportError(code, 'Export roots must be absolute.');
  return path.resolve(value);
}

function inside(root, candidate, code) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw exportError(code, 'Path escapes the configured root.');
  return path.resolve(candidate);
}

function safeSegment(value, code) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(result) || result === '.' || result === '..') {
    throw exportError(code, 'Identifier is not a safe path segment.');
  }
  return result;
}

async function assertMissing(target, code) {
  if (await stat(target).then(() => true).catch((error) => error?.code !== 'ENOENT')) {
    throw exportError(code, 'Final artifact directory already exists.');
  }
}

async function directoryNames(root) {
  return readdir(root, { withFileTypes: true })
    .then((rows) => rows.filter((row) => row.isDirectory()).map((row) => row.name))
    .catch((error) => (error?.code === 'ENOENT' ? [] : Promise.reject(error)));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clean(value) {
  return String(value ?? '').trim();
}

function exportError(code, message, options = {}) {
  const error = new Error(message, options);
  error.code = code;
  return error;
}
