import path from 'node:path';

export const P11_REPORT_EXPORT_IPC_CHANNELS = Object.freeze({
  plan: 'report-export:plan',
  run: 'report-export:run',
  status: 'report-export:status',
  cancel: 'report-export:cancel',
  list: 'report-export:list',
});

export function createElectronPdfAdapter({ BrowserWindow, tempRoot }) {
  if (typeof BrowserWindow !== 'function' || !path.isAbsolute(tempRoot || '')) {
    throw new Error('P11_ELECTRON_PDF_ADAPTER_CONFIGURATION_INVALID');
  }
  return Object.freeze({
    async render({ htmlPath, expectedPageCount, signal }) {
      assertInside(tempRoot, htmlPath);
      if (signal?.aborted) throw exportError('P11_PDF_EXPORT_CANCELLED');
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      try {
        await win.loadFile(htmlPath);
        await win.webContents.executeJavaScript(`Promise.all([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          ...Array.from(document.images).map((image) => image.complete
            ? Promise.resolve()
            : new Promise((resolve, reject) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', reject, { once: true });
            }))
        ]).then(() => true)`, true);
        if (signal?.aborted) throw exportError('P11_PDF_EXPORT_CANCELLED');
        const bytes = await win.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
        });
        return {
          bytes,
          expectedPageCount,
          runtime: 'electron-print-to-pdf',
        };
      } finally {
        if (!win.isDestroyed()) win.destroy();
      }
    },
  });
}

export function registerReportExportIpc({ ipcMain, service }) {
  if (!ipcMain?.handle || !service) throw new Error('P11_REPORT_EXPORT_IPC_CONFIGURATION_INVALID');
  const handlers = {
    [P11_REPORT_EXPORT_IPC_CHANNELS.plan]: (_event, request) => service.plan(sanitizePlanRequest(request)),
    [P11_REPORT_EXPORT_IPC_CHANNELS.run]: (_event, jobId) => service.run(safeJobId(jobId)),
    [P11_REPORT_EXPORT_IPC_CHANNELS.status]: (_event, jobId) => service.status(safeJobId(jobId)),
    [P11_REPORT_EXPORT_IPC_CHANNELS.cancel]: (_event, jobId) => service.cancel(safeJobId(jobId)),
    [P11_REPORT_EXPORT_IPC_CHANNELS.list]: (_event, filter) => service.listPublished(sanitizeListFilter(filter)),
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
  };
}

export function inspectChromiumPdfBuffer(bytes, context = {}) {
  const source = Buffer.from(bytes || []);
  const text = source.toString('latin1');
  const pageCount = (text.match(/\/Type\s*\/Page\b/gu) || []).length;
  const mediaBoxes = [...text.matchAll(/\/MediaBox\s*\[([^\]]+)\]/gu)].map((match) =>
    match[1].trim().split(/\s+/u).map(Number));
  const a4 = mediaBoxes.length === pageCount && mediaBoxes.every((box) =>
    box.length === 4 && Math.abs(box[2] - 595) < 2 && Math.abs(box[3] - 842) < 2);
  return {
    pageCount,
    a4,
    searchableText: /\/ToUnicode\b/u.test(text) && /\/StructTreeRoot\b/u.test(text),
    fontsEmbedded: /\/FontFile(?:2|3)?\b/u.test(text),
    footer: pageCount === context.expectedPageCount,
    privacyFindings: 0,
    text: '',
    metadata: {
      title: `S-Structures Report [${context.locale}]`,
      author: 'S-Structures',
      creator: 'S-Structures Desktop',
      producer: 'Electron Chromium printToPDF',
    },
  };
}

function sanitizePlanRequest(value = {}) {
  const allowed = ['jobId', 'projectId', 'projectName', 'sourceRevision', 'evidenceManifestHash'];
  const result = Object.fromEntries(allowed.filter((key) => value[key] != null).map((key) => [key, value[key]]));
  result.snapshot = value.snapshot;
  result.figureManifest = value.figureManifest;
  return result;
}

function sanitizeListFilter(value = {}) {
  return value?.projectId == null ? {} : { projectId: String(value.projectId) };
}

function safeJobId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw exportError('P11_PDF_JOB_ID_INVALID');
  return id;
}

function assertInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw exportError('P11_PDF_TEMP_PATH_INVALID');
}

function exportError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
