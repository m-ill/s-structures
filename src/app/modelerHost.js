import { clearElement } from './domUtil.js';

export const MODELER_HOST_VERSION = 'p4-m7-modeler-host-iframe';

export function mountModelerHostView(container, ctx) {
  const { document, params, session } = ctx;
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
  status.textContent = projectBacked ? 'Project modeler iframe mounted' : 'Local modeler iframe mounted';
  status.style.color = '#5f7285';
  status.style.fontSize = '12px';
  bar.appendChild(status);

  const openStandalone = document.createElement('a');
  openStandalone.setAttribute('data-role', 'open-local-modeler');
  openStandalone.href = frameUrl;
  openStandalone.target = '_blank';
  openStandalone.rel = 'noopener';
  openStandalone.textContent = 'Open standalone';
  openStandalone.style.marginLeft = 'auto';
  bar.appendChild(openStandalone);

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
  host.appendChild(iframe);
  container.appendChild(host);

  return {
    unmount() { clearElement(container); },
  };
}

export function buildModelerFrameUrl(projectId = 'local-model', options = {}) {
  const query = new URLSearchParams();
  query.set('shell', '1');
  query.set('project', projectId || 'local-model');
  query.set('storage', options.projectBacked ? 'server' : 'local');
  return `./index.html?${query.toString()}`;
}
