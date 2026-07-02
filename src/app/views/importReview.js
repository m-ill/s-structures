import { clearElement } from '../domUtil.js';
import { canConfirmImport, resolveImportCandidate, summarizeImportEntry } from '../importReviewModel.js';

export function mountImportReviewView(container, ctx) {
  const { document, api, params } = ctx;
  clearElement(container);
  const root = el(document, 'section', 'import-review');
  const title = el(document, 'h1', 'title', `Import review ${params.jobId}`);
  const list = el(document, 'div', 'candidate-list');
  const audit = el(document, 'pre', 'audit');
  const status = el(document, 'div', 'status', 'Loading...');
  const confirm = button(document, 'confirm-import', 'Confirm model');
  const reject = button(document, 'reject-import', 'Reject');
  root.appendChild(title); root.appendChild(list); root.appendChild(audit);
  root.appendChild(confirm); root.appendChild(reject); root.appendChild(status);
  container.appendChild(root);
  let summary = null;

  async function refresh() {
    status.textContent = 'Loading...';
    const data = await api.get(`/api/projects/${params.projectId}/imports/${params.jobId}`);
    summary = summarizeImportEntry(data.import);
    render();
    return summary;
  }

  async function resolve(statusName) {
    if (!summary) return null;
    const body = { status: statusName, resolvedCandidate: summary.candidate };
    const data = await api.patch(`/api/projects/${params.projectId}/imports/${params.jobId}`, { body });
    summary = summarizeImportEntry(data.import);
    render();
    return summary;
  }

  function updateCandidate(nextCandidate, note) {
    const resolved = resolveImportCandidate(summary, nextCandidate, note);
    summary = summarizeImportEntry({ ...summary, candidate: resolved });
    render();
    return summary;
  }

  function render() {
    clearElement(list);
    for (const [key, value] of Object.entries(summary.counts)) {
      const row = el(document, 'div', 'candidate-row', `${key}: ${value}`);
      row.setAttribute('data-candidate-kind', key);
      list.appendChild(row);
    }
    audit.textContent = JSON.stringify({
      status: summary.status,
      validation: summary.validation,
      review: summary.review,
      counts: summary.counts,
      source: summary.source,
      layers: summary.layers,
      planAssembly: summary.planAssembly,
      warnings: summary.warnings,
    }, null, 2);
    confirm.disabled = !canConfirmImport(summary);
    reject.disabled = summary.status === 'rejected';
    status.textContent = summary.validation.ok ? 'Ready for human confirmation.' : 'Validation errors must be fixed.';
  }

  confirm.addEventListener('click', () => resolve('confirmed'));
  reject.addEventListener('click', () => resolve('rejected'));
  refresh().catch((error) => { status.textContent = error.message || 'Failed to load import.'; });
  return { refresh, updateCandidate, confirm: () => resolve('confirmed'), reject: () => resolve('rejected'), getSummary: () => summary, unmount: () => clearElement(container) };
}

function el(document, tag, role, text = '') {
  const node = document.createElement(tag);
  node.setAttribute('data-role', role);
  node.textContent = text;
  return node;
}

function button(document, role, text) {
  const node = el(document, 'button', role, text);
  node.type = 'button';
  return node;
}
