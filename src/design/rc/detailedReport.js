import { detailRcBeam } from './beam.js';
import { detailRcColumn } from './column.js';
import { detailRcSlab } from './slab.js';
import { detailRcWall } from './wall.js';
import { collectDesignFormulaReferences } from '../../standards/designFormulaRegistry.js';

export const RC_DETAILED_DESIGN_VERSION = 'p3-m17-rc-detailed-design';
export const RC_DESIGN_GATE_VERSION = 'p3-m17-rc-design-gate-v1';

export function buildRcDetailedDesignReport(model, analysis, options = {}) {
  const checks = Object.values(analysis?.design?.concrete?.memberResults || {});
  const beams = checks.filter((check) => check.role === 'beam').map((check) => detailRcBeam(check, options));
  const columns = checks.filter((check) => check.role === 'column').map((check) => detailRcColumn(check, options));
  const walls = collectWalls(model, analysis, options).map((wall) => detailRcWall(wall, options));
  const slabs = collectSlabs(model, options).map((slab) => detailRcSlab(slab, options));
  const rows = [...beams, ...columns, ...walls, ...slabs];
  const formulaTrace = rows.map((row) => collectFormula(row)).flat();
  return {
    version: RC_DETAILED_DESIGN_VERSION,
    contract: {
      milestone: 'P3-M17',
      tickets: ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90'],
      scope: 'Traceable preliminary RC detailed-design schedules for beam, column, wall, and slab checks.',
      reportUse: 'Rows expose formula IDs and issue rows for integrated calculation packages and AI-agent review.',
    },
    modelName: model?.meta?.name || null,
    summary: summarize(rows),
    rcDesignGate: buildRcDesignGate({ beams, columns, walls, slabs, formulaTrace }),
    rows,
    schedules: { beams, columns, walls, slabs },
    issueRows: buildIssueRows(rows),
    formulaTrace,
    limitations: [
      'P3-M17 generates traceable preliminary detailed RC schedules from the current elastic demand package.',
      'Final code clause selection, seismic detailing, constructability, and drawing production still require engineer review.',
    ],
  };
}

export function buildRcDesignGate(report = {}) {
  const schedules = report.schedules || report;
  const rows = [
    ...(schedules.beams || []),
    ...(schedules.columns || []),
    ...(schedules.walls || []),
    ...(schedules.slabs || []),
  ];
  const formulas = report.formulaTrace || rows.map((row) => collectFormula(row)).flat();
  const coverage = buildRoleCoverage(schedules);
  const missingRoles = coverage.filter((row) => row.count === 0).map((row) => row.role);
  const rcReview = buildRcDesignReview({ rows, formulas, coverage, missingRoles });
  return {
    version: RC_DESIGN_GATE_VERSION,
    milestone: 'P3-M17',
    tickets: ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90'],
    contract: {
      milestone: 'P3-M17',
      tickets: ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90'],
      scope: 'RC detailed-design trace gate for beam, column, wall, and slab schedules.',
      featureTicketMap: {
        beamDetail: 'P3-T87',
        columnDetail: 'P3-T88',
        wallDetail: 'P3-T89',
        slabDetail: 'P3-T90',
      },
      reviewFields: ['summary.ticketCoverage', 'coverage', 'status', 'formulaCount', 'issueCount'],
      agentUse: 'Read-only gate for reports and AI-agent inspection of RC detailed-design role coverage.',
      maturity: 'preliminary-detail-schedule',
    },
    summary: {
      readyForAgentReview: true,
      completeRoleCoverage: missingRoles.length === 0,
      missingRoles,
      issueCount: rows.filter((row) => row.status && row.status !== 'OK').length,
      formulaCount: formulas.length,
      roleStatuses: summarizeRoleStatuses(rows),
      rcReview,
      ticketCoverage: buildTicketCoverage(coverage),
    },
    rcReview,
    schedules: {
      beams: schedules.beams?.length || 0,
      columns: schedules.columns?.length || 0,
      walls: schedules.walls?.length || 0,
      slabs: schedules.slabs?.length || 0,
    },
    status: summarize(rows),
    formulaCount: formulas.length,
    issueCount: rows.filter((row) => row.status && row.status !== 'OK').length,
    requiredRoles: ['beam', 'column', 'wall', 'slab'],
    coverage,
    ticketCoverage: buildTicketCoverage(coverage),
    missingRoles,
    completeRoleCoverage: missingRoles.length === 0,
    limitations: [
      'P3-M17 is a preliminary detailed-design trace gate for engineer review.',
      'Complete role coverage means beam, column, wall, and slab schedule rows exist; it is not final permit approval.',
      'Final clause selection, seismic detailing, drawings, and constructability remain outside this gate.',
    ],
  };
}

function buildRcDesignReview({ rows, formulas, coverage, missingRoles }) {
  const issueCount = rows.filter((row) => row.status && row.status !== 'OK').length;
  const unregisteredFormulaCount = formulas.filter((row) => row.standard === 'UNREGISTERED').length;
  const missing = [];
  if (missingRoles.length) missing.push('role-coverage');
  if (!formulas.length) missing.push('formula-trace');
  if (unregisteredFormulaCount) missing.push('formula-registry');
  if (issueCount) missing.push('design-issues');
  return {
    status: missing.length ? 'review-required' : 'trace-ready',
    maturity: 'preliminary',
    finalPermitDesign: false,
    completeRoleCoverage: missingRoles.length === 0,
    missingRoles,
    issueCount,
    formulaCount: formulas.length,
    unregisteredFormulaCount,
    coveredTickets: coverage.filter((row) => row.count > 0).map((row) => row.ticket),
    missing,
    agentDecision: missing.length ? 'resolve-rc-review-items' : 'm17-ready-for-m18-integration-review',
  };
}

function collectWalls(model, analysis, options) {
  const walls = options.walls || model?.walls || analysis?.wallPierForces || [];
  return Array.isArray(walls) ? walls : Object.values(walls);
}

function collectSlabs(model, options) {
  const slabs = options.slabs || model?.slabs || [];
  return Array.isArray(slabs) ? slabs : Object.values(slabs);
}

function summarize(rows) {
  return {
    itemCount: rows.length,
    okCount: rows.filter((row) => row.status === 'OK').length,
    warnCount: rows.filter((row) => row.status === 'WARN').length,
    ngCount: rows.filter((row) => row.status === 'NG').length,
  };
}

function buildIssueRows(rows) {
  return rows.filter((row) => row.status && row.status !== 'OK').map((row) => ({
    moduleId: 'rc',
    itemId: row.memberId || row.wallId || row.slabId || row.role,
    role: row.role,
    status: row.status,
    formulaIds: collectFormula(row).map((item) => item.formulaId),
    action: `RC ${row.role} item requires engineer review.`,
  }));
}

function summarizeRoleStatuses(rows) {
  const roles = ['beam', 'column', 'wall', 'slab'];
  return roles.map((role) => {
    const roleRows = rows.filter((row) => row.role === role);
    return {
      role,
      count: roleRows.length,
      ok: roleRows.filter((row) => row.status === 'OK').length,
      warn: roleRows.filter((row) => row.status === 'WARN').length,
      ng: roleRows.filter((row) => row.status === 'NG').length,
    };
  });
}

function buildRoleCoverage(schedules) {
  return [
    { role: 'beam', ticket: 'P3-T87', count: schedules.beams?.length || 0 },
    { role: 'column', ticket: 'P3-T88', count: schedules.columns?.length || 0 },
    { role: 'wall', ticket: 'P3-T89', count: schedules.walls?.length || 0 },
    { role: 'slab', ticket: 'P3-T90', count: schedules.slabs?.length || 0 },
  ];
}

function buildTicketCoverage(coverage) {
  return coverage.map((row) => ({
    ticket: row.ticket,
    role: row.role,
    scope: `RC ${row.role} detailed-design schedule`,
    covered: row.count > 0,
    evidence: `${row.count} ${row.role} rows`,
  }));
}

function collectFormula(row) {
  return collectDesignFormulaReferences(row, {
    id: row.memberId || row.wallId || row.slabId,
    role: row.role,
  });
}
