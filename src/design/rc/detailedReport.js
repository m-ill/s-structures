import { detailRcBeam } from './beam.js';
import { detailRcColumn } from './column.js';
import { detailRcSlab } from './slab.js';
import { detailRcWall } from './wall.js';

export const RC_DETAILED_DESIGN_VERSION = 'p3-m17-rc-detailed-design';

export function buildRcDetailedDesignReport(model, analysis, options = {}) {
  const checks = Object.values(analysis?.design?.concrete?.memberResults || {});
  const beams = checks.filter((check) => check.role !== 'column').map((check) => detailRcBeam(check, options));
  const columns = checks.filter((check) => check.role === 'column').map((check) => detailRcColumn(check, options));
  const walls = collectWalls(model, analysis, options).map((wall) => detailRcWall(wall, options));
  const slabs = collectSlabs(model, options).map((slab) => detailRcSlab(slab, options));
  const rows = [...beams, ...columns, ...walls, ...slabs];
  return {
    version: RC_DETAILED_DESIGN_VERSION,
    modelName: model?.meta?.name || null,
    summary: summarize(rows),
    schedules: { beams, columns, walls, slabs },
    formulaTrace: rows.map((row) => collectFormula(row)).flat(),
    limitations: [
      'P3-M17 generates traceable preliminary detailed RC schedules from the current elastic demand package.',
      'Final code clause selection, seismic detailing, constructability, and drawing production still require engineer review.',
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

function collectFormula(row) {
  return JSON.stringify(row).match(/KDS-[A-Z0-9-]+/g)?.map((formulaId) => ({
    id: row.memberId || row.wallId || row.slabId,
    role: row.role,
    formulaId,
  })) || [];
}
