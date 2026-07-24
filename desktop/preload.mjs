import { contextBridge, ipcRenderer } from 'electron';
import { P11_REPORT_EXPORT_IPC_CHANNELS } from './reportExportIpc.mjs';

contextBridge.exposeInMainWorld('sStructuresReportExport', Object.freeze({
  plan(request) {
    return ipcRenderer.invoke(P11_REPORT_EXPORT_IPC_CHANNELS.plan, request);
  },
  run(jobId) {
    return ipcRenderer.invoke(P11_REPORT_EXPORT_IPC_CHANNELS.run, jobId);
  },
  status(jobId) {
    return ipcRenderer.invoke(P11_REPORT_EXPORT_IPC_CHANNELS.status, jobId);
  },
  cancel(jobId) {
    return ipcRenderer.invoke(P11_REPORT_EXPORT_IPC_CHANNELS.cancel, jobId);
  },
  list(filter = {}) {
    return ipcRenderer.invoke(P11_REPORT_EXPORT_IPC_CHANNELS.list, filter);
  },
}));
