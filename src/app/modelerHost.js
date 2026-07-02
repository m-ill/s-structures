/**
 * Placeholder modeler host for the app shell route `#/p/:projectId/modeler`.
 *
 * The full native modeler (src/ui/indexNativeModeler.js and friends) still
 * boots from index.html directly — that dual-entry behavior is required
 * (FRONTEND_PLAN.md). Wiring the native modeler into this shell route with
 * server-backed save/load is P3-T13 (persistence integration) and is not
 * done here; this view only proves the shell can route to a project and
 * hold its id for later tickets to build on.
 */
import { clearElement } from './domUtil.js';

export function mountModelerHostView(container, ctx) {
  const { document, params, session } = ctx;
  clearElement(container);
  const projectId = params.projectId || 'local-model';
  session.setCurrentProject(params.projectId || null);

  const heading = document.createElement('div');
  heading.setAttribute('data-role', 'modeler-project-id');
  heading.textContent = projectId;
  container.appendChild(heading);

  const note = document.createElement('div');
  note.setAttribute('data-role', 'modeler-placeholder-note');
  note.textContent = params.projectId
    ? 'Native modeler integration is pending (P3-T13).'
    : 'Open index.html for the local modeling workspace. Login is optional for server project storage.';
  container.appendChild(note);

  if (!params.projectId) {
    const link = document.createElement('a');
    link.setAttribute('data-role', 'open-local-modeler');
    link.href = './index.html';
    link.textContent = 'Open modeling workspace';
    container.appendChild(link);
  }

  return {
    unmount() { clearElement(container); },
  };
}
