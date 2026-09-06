export const INDEX_DESIGN_WORKFLOW_VERSION = 'm21-design-workflow';

export function buildDesignWorkflow(model, analysis) {
  const rows = collectDesignRows(analysis);
  const counts = countStatuses(rows);
  const governing = rows[0] || null;
  const checks = [
    workflowCheck('model', 'Model', modelCompleteness(model), modelDetail(model)),
    workflowCheck('loads', 'Loads', loadCompleteness(model), loadDetail(model)),
    workflowCheck('analysis', 'Analysis', analysisCompleteness(analysis), analysisDetail(analysis)),
    workflowCheck('design', 'Design', designCompleteness(analysis, rows), designDetail(analysis, rows)),
  ];
  return {
    version: INDEX_DESIGN_WORKFLOW_VERSION,
    status: workflowStatus(checks, counts),
    counts,
    governing,
    checks,
    nextActions: nextActions(model, analysis, rows, counts),
    rows: rows.slice(0, 10),
  };
}

export function renderDesignWorkflowMarkup(workflow) {
  return `
    <div class="sse-workflow" data-agent-id="engine-design-workflow">
      <div class="sse-workflow-head">
        <strong>Design Workflow</strong>
        <span class="${statusClass(workflow.status)}">${escapeHtml(workflow.status)}</span>
      </div>
      <div class="sse-workflow-counts">
        ${[
          ['OK', workflow.counts.ok],
          ['WARN', workflow.counts.warn],
          ['NG', workflow.counts.ng],
          ['Unchecked', workflow.counts.unchecked],
        ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}
      </div>
      <div class="sse-workflow-checks">
        ${workflow.checks.map((item) => `
          <div class="${statusClass(item.status)}">
            <b>${escapeHtml(item.label)}</b>
            <span>${escapeHtml(item.status)}</span>
            <small>${escapeHtml(item.detail)}</small>
          </div>
        `).join('')}
      </div>
      ${renderNextActions(workflow.nextActions)}
    </div>
  `;
}

function collectDesignRows(analysis) {
  return Object.values({
    ...(analysis?.design?.steel?.memberResults || {}),
    ...(analysis?.design?.concrete?.memberResults || {}),
  }).map((item) => ({
    memberId: item.memberId || '-',
    type: item.type || inferType(item),
    status: normalizeStatus(item.status || (item.ok ? 'OK' : 'NG')),
    utilization: Number(item.utilization) || 0,
    governingCheck: item.governingCheck || '-',
    comboId: item.comboId || '-',
  })).sort((a, b) => b.utilization - a.utilization);
}

function countStatuses(rows) {
  const counts = { ok: 0, warn: 0, ng: 0, unchecked: 0, total: rows.length };
  for (const row of rows) {
    if (row.status === 'OK') counts.ok += 1;
    else if (row.status === 'WARN') counts.warn += 1;
    else if (row.status === 'NG') counts.ng += 1;
    else counts.unchecked += 1;
  }
  return counts;
}

function workflowCheck(id, label, status, detail) {
  return { id, label, status, detail };
}

function modelCompleteness(model) {
  if (!model?.nodes?.length || !model?.members?.length) return 'NG';
  if (!model.sections?.length || !model.materials?.length) return 'WARN';
  return 'OK';
}

function modelDetail(model) {
  return `${model?.nodes?.length || 0} nodes, ${model?.members?.length || 0} members`;
}

function loadCompleteness(model) {
  if (!model?.loadCases?.length || !model?.loadCombinations?.length) return 'NG';
  if (!model?.loads?.length) return 'WARN';
  return 'OK';
}

function loadDetail(model) {
  return `${model?.loadCases?.length || 0} cases, ${model?.loadCombinations?.length || 0} combos`;
}

function analysisCompleteness(analysis) {
  if (!analysis) return 'NG';
  if (!analysis.ok) return 'NG';
  if (analysis.validation?.warnings?.length) return 'WARN';
  return 'OK';
}

function analysisDetail(analysis) {
  if (!analysis) return 'No analysis';
  return `${analysis.combos?.length || 0} combos, ${analysis.validation?.warnings?.length || 0} warnings`;
}

function designCompleteness(analysis, rows) {
  if (!analysis?.design) return 'NG';
  if (!rows.length) return 'WARN';
  if (rows.some((row) => row.status === 'NG')) return 'NG';
  if (rows.some((row) => row.status === 'WARN')) return 'WARN';
  return 'OK';
}

function designDetail(analysis, rows) {
  return `${analysis?.design?.summary?.checkedMembers || rows.length || 0} members checked`;
}

function workflowStatus(checks, counts) {
  if (checks.some((item) => item.status === 'NG') || counts.ng > 0) return 'NG';
  if (checks.some((item) => item.status === 'WARN') || counts.warn > 0 || counts.unchecked > 0) return 'WARN';
  return 'OK';
}

function nextActions(model, analysis, rows, counts) {
  const actions = [];
  if (!model?.members?.length) actions.push('Create members before design review.');
  if (!model?.loadCombinations?.length) actions.push('Add at least one load combination.');
  if (!analysis?.ok) actions.push('Resolve analysis errors before using design ratios.');
  if (counts.ng > 0) {
    const row = rows.find((item) => item.status === 'NG');
    actions.push(`Revise ${row?.memberId || 'governing member'} for ${row?.governingCheck || 'governing check'}.`);
  }
  if (counts.warn > 0) actions.push('Review warning members and serviceability assumptions.');
  if (!actions.length) actions.push('Ready for detailed report export and engineering review.');
  return actions.slice(0, 4);
}

function renderNextActions(actions) {
  return `<div class="sse-workflow-actions">
    <b>Next</b>
    ${actions.map((action) => `<div>${escapeHtml(action)}</div>`).join('')}
  </div>`;
}

function normalizeStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'OK') return 'OK';
  if (value === 'WARN') return 'WARN';
  if (value === 'NG') return 'NG';
  return 'UNCHECKED';
}

function statusClass(status) {
  return `sse-${String(status || 'unchecked').toLowerCase()}`;
}

function inferType(item) {
  if (item.governingCheck?.startsWith?.('rc-')) return 'RC';
  if (item.governingCheck?.startsWith?.('steel-')) return 'Steel';
  return '-';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
