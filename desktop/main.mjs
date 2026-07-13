import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { startServer } from '../server/main.mjs';

let serverApp = null;
const DESKTOP_ORIGIN_PORT = 43817;

async function createWindow() {
  const dataDir = join(app.getPath('userData'), 'data');
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
  const win = new BrowserWindow({ width: 1280, height: 820, title: 'S-Structures' });
  await win.loadURL(`http://127.0.0.1:${address.port}/`);
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async () => {
  if (!serverApp) return;
  await new Promise((resolve) => serverApp.server.close(resolve));
  await serverApp.releaseDataDirLock?.();
});
