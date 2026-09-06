import { clearElement } from '../domUtil.js';

export function mountLibraryView(container, ctx) {
  const { document, api, params } = ctx;
  clearElement(container);
  const root = el(document, 'section', 'library');
  const heading = el(document, 'h1', 'library-project-id', params.projectId);
  const kind = input(document, 'library-kind', 'materials');
  const id = input(document, 'library-id', 'SS275');
  const version = input(document, 'library-version', '1');
  const e = input(document, 'library-e', '205000');
  const g = input(document, 'library-g', '79000');
  const fy = input(document, 'library-fy', '275');
  const fu = input(document, 'library-fu', '410');
  const save = button(document, 'library-save', 'Save');
  const list = el(document, 'div', 'library-list');
  const status = el(document, 'div', 'library-status', 'Loading...');
  [heading, kind, id, version, e, g, fy, fu, save, list, status].forEach((node) => root.appendChild(node));
  container.appendChild(root);

  async function refresh() {
    status.textContent = 'Loading...';
    const data = await api.get(path());
    clearElement(list);
    for (const item of data.items || []) {
      const row = el(document, 'div', 'library-row', `${item.id}@${item.version || 1}`);
      row.setAttribute('data-library-id', item.id);
      row.setAttribute('data-library-version', String(item.version || 1));
      list.appendChild(row);
    }
    status.textContent = '';
    return data.items || [];
  }

  async function saveItem(record = readRecord()) {
    status.textContent = 'Saving...';
    const data = await api.put(`${path()}/${encodeURIComponent(record.id)}`, { body: { item: record } });
    status.textContent = `Saved ${data.item.id}@${data.item.version || 1}`;
    await refresh();
    return data.item;
  }

  function path() {
    return `/api/projects/${params.projectId}/library/${kind.value || 'materials'}`;
  }

  function readRecord() {
    return {
      id: id.value.trim(),
      version: Number(version.value || 1),
      E: Number(e.value),
      G: Number(g.value),
      Fy: Number(fy.value),
      Fu: Number(fu.value),
    };
  }

  save.addEventListener('click', () => saveItem().catch((error) => { status.textContent = error.message; }));
  refresh().catch((error) => { status.textContent = error.message || 'Failed to load library.'; });
  return { refresh, saveItem, fields: { kind, id, version, e, g, fy, fu }, unmount: () => clearElement(container) };
}

function el(document, tag, role, text = '') {
  const node = document.createElement(tag);
  node.setAttribute('data-role', role);
  node.textContent = text;
  return node;
}

function input(document, role, value) {
  const node = el(document, 'input', role);
  node.value = value;
  return node;
}

function button(document, role, text) {
  const node = el(document, 'button', role, text);
  node.type = 'button';
  return node;
}
