import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/main.mjs';
import { createPdfExportService } from '../server/report/phase11/pdfExportService.mjs';
import {
  createElectronPdfAdapter,
  inspectChromiumPdfBuffer,
  registerReportExportIpc,
} from './reportExportIpc.mjs';

let serverApp = null;
let releaseReportExportIpc = null;
const DESKTOP_ORIGIN_PORT = 43817;
const desktopDir = fileURLToPath(new URL('.', import.meta.url));

async function createWindow() {
  const dataDir = join(app.getPath('userData'), 'data');
  const reportTempRoot = join(app.getPath('temp'), 's-structures', 'phase11');
  const reportOutputRoot = join(app.getPath('documents'), 'S-Structures', 'Reports');
  const configuredPort = Number(process.env.S_STRUCTURES_DESKTOP_PORT || DESKTOP_ORIGIN_PORT);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort < 65536
    ? configuredPort
    : DESKTOP_ORIGIN_PORT;
  serverApp = await startServer({ host: '127.0.0.1', port, dataDir });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    serverApp.server.once('error', onError);
    serverApp.server.listen(port, '127.0.0.1', () => {
      serverApp.server.off('error', onError);
      resolve();
    });
  });
  const address = serverApp.server.address();
  const reportExportService = createPdfExportService({
    outputRoot: reportOutputRoot,
    tempRoot: reportTempRoot,
    assetSourceRoot: reportTempRoot,
    adapter: createElectronPdfAdapter({ BrowserWindow, tempRoot: reportTempRoot }),
    inspectPdf: inspectChromiumPdfBuffer,
  });
  releaseReportExportIpc = registerReportExportIpc({ ipcMain, service: reportExportService });
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'S-Structures',
    webPreferences: {
      preload: join(desktopDir, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadURL(`http://127.0.0.1:${address.port}/`);
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async () => {
  releaseReportExportIpc?.();
  releaseReportExportIpc = null;
  if (!serverApp) return;
  await new Promise((resolve) => serverApp.server.close(resolve));
  await serverApp.releaseDataDirLock?.();
});
