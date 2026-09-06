import { buildHash } from '../routes.js';
import { clearElement } from '../domUtil.js';

export function mountProjectsView(container, ctx) {
  const { document, api, session, navigate } = ctx;
  clearElement(container);

  const list = document.createElement('ul');
  list.setAttribute('data-role', 'project-list');

  const nameInput = document.createElement('input');
  nameInput.setAttribute('data-field', 'new-project-name');

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.textContent = 'Create project';

  const status = document.createElement('div');
  status.setAttribute('data-role', 'status');

  container.appendChild(list);
  container.appendChild(nameInput);
  container.appendChild(createButton);
  container.appendChild(status);

  async function refresh() {
    status.textContent = 'Loading...';
    try {
      const result = await api.get('/api/projects');
      clearElement(list);
      for (const project of result.projects) {
        const item = document.createElement('li');
        item.setAttribute('data-project-id', project.id);
        item.textContent = project.name;
        item.addEventListener('click', () => {
          session.setCurrentProject(project.id);
          navigate(buildHash('modeler', { projectId: project.id }));
        });
        list.appendChild(item);
      }
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message || 'Failed to load projects.';
    }
  }

  async function handleCreate() {
    if (!nameInput.value.trim()) return;
    status.textContent = 'Creating...';
    try {
      await api.post('/api/projects', { body: { name: nameInput.value.trim() } });
      nameInput.value = '';
      await refresh();
    } catch (error) {
      status.textContent = error.message || 'Failed to create project.';
    }
  }

  createButton.addEventListener('click', handleCreate);
  refresh();

  return {
    unmount() { clearElement(container); },
    refresh,
    createProject: handleCreate,
    fields: { nameInput },
  };
}
