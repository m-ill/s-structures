import { installHostWebMcp } from './webmcpHost.js';
import { clearElement } from './domUtil.js';
import { buildHash } from './routes.js';
import { createPersistenceClient } from './persistenceClient.js';
import { createModelerBridge } from './modelerBridge.js';
import { createAutosaveScheduler } from './autosaveScheduler.js';
import { latestAutosave, pushAutosave, readEntries } from './autosaveRingBuffer.js';

export const MODELER_HOST_VERSION = 'p4-m7-modeler-host-save-flow';

export function mountModelerHostView(container, ctx) {
  const { document, window, api, params, session, navigate, modelerBridgeFactory } = ctx;
  clearElement(container);

  const projectId = params.projectId || 'local-model';
  const projectBacked = !!params.projectId;
  session.setCurrentProject(projectBacked ? projectId : null);

  const frameUrl = buildModelerFrameUrl(projectId, { projectBacked });
  const host = document.createElement('section');
  host.setAttribute('data-view', 'modeler-host');
  host.setAttribute('data-version', MODELER_HOST_VERSION);
  host.style.display = 'grid';
  host.style.gridTemplateRows = 'auto 1fr';
  host.style.minHeight = '100vh';

  const bar = document.createElement('div');
  bar.setAttribute('data-role', 'modeler-host-bar');
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.gap = '8px';
  bar.style.padding = '8px 10px';
  bar.style.borderBottom = '1px solid #d7e2ee';
  bar.style.background = '#f8fbff';

  const heading = document.createElement('div');
  heading.setAttribute('data-role', 'modeler-project-id');
  heading.textContent = projectId;
  heading.style.fontWeight = '600';
  bar.appendChild(heading);

  const status = document.createElement('div');
  status.setAttribute('data-role', 'modeler-host-status');
  status.textContent = projectBacked ? 'Project modeler ready for server save' : 'Local modeler iframe mounted';
  status.style.color = '#5f7285';
  status.style.fontSize = '12px';
  bar.appendChild(status);

  const unsaved = document.createElement('div');
  unsaved.setAttribute('data-role', 'modeler-unsaved-status');
  unsaved.textContent = projectBacked ? 'Saved' : 'Local';
  unsaved.style.fontSize = '12px';
  bar.appendChild(unsaved);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.setAttribute('data-role', 'modeler-save');
  saveButton.textContent = projectBacked ? 'Save revision' : 'Local save only';
  saveButton.disabled = !projectBacked;
  saveButton.style.marginLeft = 'auto';
  bar.appendChild(saveButton);

  const revisionsLink = document.createElement('button');
  revisionsLink.type = 'button';
  revisionsLink.setAttribute('data-role', 'modeler-revisions-link');
  revisionsLink.textContent = 'Revisions';
  revisionsLink.disabled = !projectBacked;
  revisionsLink.addEventListener('click', () => {
    if (projectBacked) navigate(buildHash('revisions', { projectId }));
  });
  bar.appendChild(revisionsLink);

  const openStandalone = document.createElement('a');
  openStandalone.setAttribute('data-role', 'open-local-modeler');
  openStandalone.href = frameUrl;
  openStandalone.target = '_blank';
  openStandalone.rel = 'noopener';
  openStandalone.textContent = 'Open standalone';
  bar.appendChild(openStandalone);

  const lineageBanner = document.createElement('div');
  lineageBanner.setAttribute('data-role', 'modeler-lineage-warning');
  lineageBanner.hidden = true;
  lineageBanner.style.padding = '8px 10px';
  lineageBanner.style.background = '#fff7dc';
  lineageBanner.style.borderBottom = '1px solid #ead79d';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-role', 'modeler-frame');
  iframe.setAttribute('title', 'S-Structures native modeler');
  iframe.setAttribute('src', frameUrl);
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.background = '#fff';

  host.appendChild(bar);
  host.appendChild(lineageBanner);
  host.appendChild(iframe);
  container.appendChild(host);

  const bridge = (modelerBridgeFactory || createModelerBridge)({ window, iframe });
  const webmcpHost=installHostWebMcp({window,iframe,projectId,onActivity:name=>{status.textContent=`WebMCP: ${name}`;if(name.startsWith('apply_'))markUnsaved();}});
  const persistence = projectBacked ? createPersistenceClient(api) : null;
  const storage = window?.localStorage || null;
  const autosaveScope = `project-${projectId}`;
  const autosaveScheduler = createAutosaveScheduler((reason) => saveAutosave(reason), ctx.autosaveOptions || {});
  let lastSavedRev = null;
  let dirty = false;
  let saving = null;
  let autosaveInFlight = null;

  async function saveProjectRevision() {
    if (!projectBacked) return null;
    if (saving) return saving;
    saveButton.disabled = true;
    status.textContent = 'Saving revision...';
    saving = (async () => {
      try {
        const model = await bridge.getModel();
        const result = await persistence.saveToServer(projectId, model, {
          note: 'Saved from modeler host',
          parentRev: lastSavedRev,
        });
        lastSavedRev = result.rev;
        dirty = false;
        status.textContent = `Saved rev ${result.rev}`;
        updateUnsavedStatus();
        lineageBanner.hidden = !result.lineageWarning;
        lineageBanner.textContent = result.lineageWarning
          ? `Lineage warning: latest revision is ${result.latestRev}. Open revisions to compare.`
          : '';
        return result;
      } catch (error) {
        status.textContent = error.message || 'Failed to save revision.';
        throw error;
      } finally {
        saveButton.disabled = false;
        saving = null;
      }
    })();
    return saving;
  }

  function markUnsaved() {
    if (!projectBacked) return false;
    dirty = true;
    updateUnsavedStatus();
    autosaveScheduler.notifyChange();
    return true;
  }

  function saveAutosave(reason = 'manual') {
    if (!projectBacked || !storage) return Promise.resolve(null);
    autosaveInFlight = bridge.getModel()
      .then((model) => pushAutosave(storage, autosaveScope, { model, reason, savedAt: new Date().toISOString() }))
      .then((entries) => {
        updateUnsavedStatus();
        return entries;
      })
      .catch((error) => {
        status.textContent = error.message || 'Autosave failed.';
        return null;
      });
    return autosaveInFlight;
  }

  async function flushAutosave() {
    return saveAutosave('flush');
  }

  function updateUnsavedStatus() {
    const latest = storage ? latestAutosave(storage, autosaveScope) : null;
    const autosaveText = latest ? `, autosaved ${latest.payload?.reason || 'change'}` : '';
    unsaved.textContent = dirty ? `Unsaved${autosaveText}` : `Saved${autosaveText}`;
  }

  function onKeydown(event) {
    if (!projectBacked) return;
    const key = String(event?.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault?.();
      saveProjectRevision().catch(() => {});
    }
  }

  saveButton.addEventListener('click', () => {
    saveProjectRevision().catch(() => {});
  });
  window?.addEventListener?.('keydown', onKeydown);

  return {
    saveProjectRevision,
    getLastSavedRev() { return lastSavedRev; },
    unmount() {
      window?.removeEventListener?.('keydown', onKeydown);
      autosaveScheduler.dispose();
      webmcpHost.dispose();
      bridge.dispose?.();
      clearElement(container);
    },
    markUnsaved,
    flushAutosave,
    getAutosaveEntries() { return storage ? readEntries(storage, autosaveScope) : []; },
    getAutosaveInFlight() { return autosaveInFlight; },
  };
}

export function buildModelerFrameUrl(projectId = 'local-model', options = {}) {
  const query = new URLSearchParams();
  query.set('shell', '1');
  query.set('project', projectId || 'local-model');
  query.set('storage', options.projectBacked ? 'server' : 'local');
  return `./index.html?${query.toString()}`;
}
