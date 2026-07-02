import { buildHash } from '../routes.js';
import { clearElement } from '../domUtil.js';

export function mountRevisionsView(container, ctx) {
  const { document, api, navigate, params } = ctx;
  clearElement(container);

  const projectId = params.projectId;
  const heading = document.createElement('div');
  heading.setAttribute('data-role', 'revisions-project-id');
  heading.textContent = projectId;

  const list = document.createElement('ul');
  list.setAttribute('data-role', 'revision-list');

  const status = document.createElement('div');
  status.setAttribute('data-role', 'revision-status');

  const back = document.createElement('button');
  back.type = 'button';
  back.setAttribute('data-action', 'open-modeler');
  back.textContent = 'Open modeler';
  back.addEventListener('click', () => navigate(buildHash('modeler', { projectId })));

  container.appendChild(heading);
  container.appendChild(list);
  container.appendChild(back);
  container.appendChild(status);

  async function refresh() {
    status.textContent = 'Loading...';
    try {
      const result = await api.get(`/api/projects/${encodeURIComponent(projectId)}/revisions`);
      clearElement(list);
      for (const revision of result.revisions || []) {
        const item = document.createElement('li');
        item.setAttribute('data-revision-rev', String(revision.rev));
        item.textContent = `rev ${revision.rev}`;
        list.appendChild(item);
      }
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message || 'Failed to load revisions.';
    }
  }

  refresh();

  return {
    unmount() { clearElement(container); },
    refresh,
  };
}
