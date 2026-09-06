import { materialOf, sectionOf } from '../core/catalogs.js';
import { buildRcDetailingReport } from './rcDetailing.js';
import { buildSteelDetailingReport } from './steelDetailing.js';

export const MEMBER_DESIGN_TRACE_VERSION = 'm45-member-design-trace';

export function buildMemberDesignTraceReport(model, analysis, options = {}) {
  const steelDetailing = buildSteelDetailingReport(model, analysis, options.steel || {});
  const rcDetailing = buildRcDetailingReport(model, analysis, options.rc || {});
  const steelRows = new Map(steelDetailing.rows.map((row) => [row.memberId, row]));
  const rcRows = new Map(rcDetailing.rows.map((row) => [row.memberId, row]));
  const steelChecks = analysis?.design?.steel?.memberResults || {};
  const concreteChecks = analysis?.design?.concrete?.memberResults || {};

  const rows = (model?.members || []).map((member) => {
    const steelCheck = steelChecks[member.id] || null;
    const concreteCheck = concreteChecks[member.id] || null;
    const check = steelCheck || concreteCheck || null;
    const designType = steelCheck ? 'steel' : concreteCheck ? 'concrete' : 'unimplemented';
    const material = materialOf(model, member.matId);
    const section = sectionOf(model, member.secId);
    const schedule = steelRows.get(member.id) || rcRows.get(member.id) || null;
    const formulaTrace = (check?.checks || []).map((item) => ({
      id: item.id,
      name: item.name,
      expression: item.expression || null,
      demand: finite(item.demand, null),
      capacity: finite(item.capacity, null),
      ratio: finite(item.ratio, null),
      status: item.status || statusForRatio(item.ratio),
      comboId: item.comboId || check?.comboId || null,
      x: finite(item.x, check?.x, null),
    }));
    const status = check?.status || 'UNCK';
    return {
      version: MEMBER_DESIGN_TRACE_VERSION,
      memberId: member.id,
      designType,
      role: check?.role || member.design?.role || member.type || 'member',
      material: material?.name || member.matId || '-',
      section: section?.name || member.secId || '-',
      status,
      utilization: finite(check?.utilization, null),
      governingCheck: check?.governingCheck || null,
      comboId: check?.comboId || null,
      station: finite(check?.x, null),
      demandTrace: normalizeNumericObject(check?.demands || {}),
      capacityTrace: normalizeNumericObject(check?.capacities || {}),
      formulaTrace,
      schedule: summarizeSchedule(designType, schedule),
      actionItems: actionItemsFor(member, check, schedule, formulaTrace),
      messages: normalizeMessages(check?.messages || schedule?.messages || []),
    };
  });

  const checkedRows = rows.filter((row) => row.status !== 'UNCK');
  const governing = checkedRows
    .filter((row) => Number.isFinite(row.utilization))
    .reduce((best, row) => (!best || row.utilization > best.utilization ? row : best), null);

  return {
    version: MEMBER_DESIGN_TRACE_VERSION,
    modelName: model?.meta?.name || null,
    summary: {
      memberCount: rows.length,
      checkedCount: checkedRows.length,
      unimplementedCount: rows.length - checkedRows.length,
      okCount: rows.filter((row) => row.status === 'OK').length,
      warnCount: rows.filter((row) => row.status === 'WARN').length,
      ngCount: rows.filter((row) => row.status === 'NG').length,
      maxUtilization: governing?.utilization || 0,
      governing: governing ? {
        memberId: governing.memberId,
        designType: governing.designType,
        status: governing.status,
        utilization: governing.utilization,
        governingCheck: governing.governingCheck,
        comboId: governing.comboId,
      } : null,
    },
    rows,
    limitations: [
      'Trace rows expose currently implemented preliminary checks only.',
      'A row marked UNCK means the member has no implemented material-specific design module yet.',
      'Final detailing, connection, foundation, and drawing-level decisions require project-specific engineering review.',
    ],
  };
}

function summarizeSchedule(designType, schedule) {
  if (!schedule) return null;
  if (designType === 'steel') {
    return {
      type: 'steel',
      slenderness: schedule.slenderness || null,
      deflection: schedule.deflection || null,
      reviewActions: (schedule.reviewActions || []).slice(),
    };
  }
  if (designType === 'concrete') {
    return {
      type: 'concrete',
      longitudinal: schedule.longitudinal || null,
      transverse: schedule.transverse || null,
      requiredRebar: schedule.requiredRebar || null,
    };
  }
  return null;
}

function actionItemsFor(member, check, schedule, formulaTrace) {
  const actions = [];
  if (!check) {
    actions.push(`Add or select a design module for member ${member.id}.`);
    return actions;
  }
  const governing = formulaTrace.find((item) => item.id === check.governingCheck)
    || formulaTrace.reduce((best, item) => (!best || (item.ratio || 0) > (best.ratio || 0) ? item : best), null);
  if (check.status === 'NG') actions.push(`Revise member for ${governing?.name || check.governingCheck || 'governing check'}.`);
  if (check.status === 'WARN') actions.push(`Review reserve margin for ${governing?.name || check.governingCheck || 'governing check'}.`);
  for (const item of schedule?.reviewActions || []) actions.push(item);
  for (const message of check.messages || []) {
    if (message.level === 'error') actions.push(message.message);
  }
  if (!actions.length) actions.push('Confirm project-specific detailing and constructability requirements.');
  return uniqueStrings(actions);
}

function normalizeMessages(messages) {
  return messages.map((item) => ({
    code: item.code || null,
    level: item.level || 'info',
    message: item.message || String(item),
  }));
}

function normalizeNumericObject(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, finite(item, item)]));
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

function statusForRatio(ratio) {
  const value = Number(ratio);
  if (!Number.isFinite(value)) return 'UNCK';
  if (value > 1) return 'NG';
  if (value >= 0.7) return 'WARN';
  return 'OK';
}

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}
