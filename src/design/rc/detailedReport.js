import { detailRcBeam } from './beam.js';
import { detailRcColumn } from './column.js';
import { detailRcSlab } from './slab.js';
import { detailRcWall } from './wall.js';

export const RC_DETAILED_DESIGN_VERSION = 'p3-m17-rc-detailed-design';
export const RC_DESIGN_GATE_VERSION = 'p3-m17-rc-design-gate-v1';

export function buildRcDetailedDesignReport(model, analysis, options = {}) {
  const checks = Object.values(analysis?.design?.concrete?.memberResults || {});
  const beams = checks.filter((check) => check.role !== 'column').map((check) => detailRcBeam(check, options));
  const columns = checks.filter((check) => check.role === 'column').map((check) => detailRcColumn(check, options));
  const walls = collectWalls(model, analysis, options).map((wall) => detailRcWall(wall, options));
  const slabs = collectSlabs(model, options).map((slab) => detailRcSlab(slab, options));
  const rows = [...beams, ...columns, ...walls, ...slabs];
  const formulaTrace = rows.map((row) => collectFormula(row)).flat();
  return {
    version: RC_DETAILED_DESIGN_VERSION,
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
  return {
    version: RC_DESIGN_GATE_VERSION,
    milestone: 'P3-M17',
    tickets: ['P3-T87', 'P3-T88', 'P3-T89', 'P3-T90'],
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
    limitations: [
      'P3-M17 is a preliminary detailed-design trace gate for engineer review.',
      'Final clause selection, seismic detailing, drawings, and constructability remain outside this gate.',
    ],
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
    action: `RC ${row.role} item requires engineer review.`,
  }));
}

function collectFormula(row) {
  return JSON.stringify(row).match(/KDS-[A-Z0-9-]+/g)?.map((formulaId) => ({
    id: row.memberId || row.wallId || row.slabId,
    role: row.role,
    formulaId,
  })) || [];
}
