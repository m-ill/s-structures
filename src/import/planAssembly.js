import { wireframeToImportCandidate } from './wireframe.js';

export const PLAN_ASSEMBLY_VERSION = 'p3-m7-plan-assembly';

export function assemblePlansToImportCandidate(plans = [], options = {}) {
  const ordered = [...plans].sort((a, b) => Number(a.elevation) - Number(b.elevation));
  const segments = [];
  const columnKeys = new Map();
  for (const plan of ordered) {
    for (const beam of plan.beams || []) {
      segments.push({
        from: [beam.from.x, beam.from.y, plan.elevation],
        to: [beam.to.x, beam.to.y, plan.elevation],
        layer: beam.layer,
        kindHint: beam.kind || 'beam',
        sectionHint: beam.sectionHint,
        materialHint: beam.materialHint,
      });
    }
    for (const column of plan.columns || []) {
      const key = pointKey(column, options.columnTolerance || 1e-3);
      columnKeys.set(key, columnKeys.get(key) || []);
      columnKeys.get(key).push(column);
    }
  }
  for (const columns of columnKeys.values()) {
    const sorted = columns.sort((a, b) => a.z - b.z);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      segments.push({
        from: [sorted[i].x, sorted[i].y, sorted[i].z],
        to: [sorted[i + 1].x, sorted[i + 1].y, sorted[i + 1].z],
        layer: sorted[i].layer,
        kindHint: 'column',
        sectionHint: sorted[i].sectionHint || sorted[i + 1].sectionHint,
        materialHint: sorted[i].materialHint || sorted[i + 1].materialHint,
      });
    }
  }
  const candidate = wireframeToImportCandidate(segments, {
    ...options,
    source: options.source || { type: 'dxf-plan-assembly', units: 'm' },
  });
  candidate.import = {
    version: PLAN_ASSEMBLY_VERSION,
    planCount: ordered.length,
  };
  candidate.audit = {
    ...candidate.audit,
    planAssembly: {
      version: PLAN_ASSEMBLY_VERSION,
      planCount: ordered.length,
      columnStackCount: columnKeys.size,
      generatedSegmentCount: segments.length,
    },
  };
  return candidate;
}

function pointKey(point, tolerance) {
  const scale = 1 / Math.max(tolerance, 1e-12);
  return `${Math.round(point.x * scale)}:${Math.round(point.y * scale)}`;
}
