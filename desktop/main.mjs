import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { startServer } from '../server/main.mjs';

let serverApp = null;

async function createWindow() {
  const dataDir = join(app.getPath('userData'), 'data');
  serverApp = await startServer({ host: '127.0.0.1', port: 0, dataDir });
  await new Promise((resolve) => serverApp.server.listen(0, '127.0.0.1', resolve));
  const address = serverApp.server.address();
  const win = new BrowserWindow({ width: 1280, height: 820, title: 'S-Structures' });
  await win.loadURL(`http://127.0.0.1:${address.port}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async () => {
  if (!serverApp) return;
  await new Promise((resolve) => serverApp.server.close(resolve));
  await serverApp.releaseDataDirLock?.();
});
