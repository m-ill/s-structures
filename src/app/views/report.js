import { buildHash } from '../routes.js';
import { clearElement } from '../domUtil.js';

export function mountReportView(container, ctx) {
  const { document, navigate, params } = ctx;
  clearElement(container);

  const projectId = params.projectId;
  const heading = document.createElement('div');
  heading.setAttribute('data-role', 'report-project-id');
  heading.textContent = projectId;

  const note = document.createElement('div');
  note.setAttribute('data-role', 'report-shell-note');
  note.textContent = 'Open index.html calculation package for the full native report workspace.';

  const modeler = document.createElement('button');
  modeler.type = 'button';
  modeler.setAttribute('data-action', 'open-modeler');
  modeler.textContent = 'Open modeler';
  modeler.addEventListener('click', () => navigate(buildHash('modeler', { projectId })));

  container.appendChild(heading);
  container.appendChild(note);
  container.appendChild(modeler);

  return {
    unmount() { clearElement(container); },
  };
}
