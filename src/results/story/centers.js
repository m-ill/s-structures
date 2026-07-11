import { buildStoryMassSummary } from '../../core/storyMassSummary.js';

export const STORY_CENTERS_TRACE_VERSION = 'p6-m4-story-centers-trace-v1';

export function buildStoryCentersTrace(model = {}) {
  const mass = buildStoryMassSummary(model);
  const rows = (mass.rows || []).map((row) => {
    const warnings = [];
    if (row.stiffnessCenter?.source === 'column-proxy') warnings.push('center-of-rigidity uses column stiffness proxy until unit-load CoR solve is enabled.');
    if (!row.diaphragmCenter) warnings.push('no diaphragm center assigned for story.');
    return {
      story: row.story,
      storyId: row.storyId,
      z: row.z,
      nodeCount: row.nodeCount,
      mass: row.mass,
      centerOfMass: row.massCenter,
      centerOfRigidity: row.stiffnessCenter,
      diaphragmCenter: row.diaphragmCenter,
      eccentricity: row.eccentricity,
      dimensions: {
        z: 'length',
        mass: 'mass',
        centerOfMass: 'length',
        centerOfRigidity: 'length',
        diaphragmCenter: 'length',
        eccentricity: 'length',
      },
      warnings,
    };
  });
  return {
    version: STORY_CENTERS_TRACE_VERSION,
    sourceVersion: mass.version,
    source: mass.source,
    dimensions: {
      elevation: 'length',
      mass: 'mass',
      center: 'length',
      eccentricity: 'length',
    },
    units: {
      elevation: model?.units?.length || 'm',
      mass: model?.units?.mass || 't',
      center: model?.units?.length || 'm',
      eccentricity: model?.units?.length || 'm',
    },
    provenance: {
      source: 'story-mass-and-stiffness-center-geometry',
      staticCaseReferences: [],
    },
    rows,
    warnings: [...new Set(rows.flatMap((row) => row.warnings))],
    summary: {
      storyCount: rows.length,
      totalMass: mass.totalMass,
      maxMassToRigidityEccentricity: Math.max(0, ...rows.map((row) => hypot(row.eccentricity?.massToStiffness))),
      maxMassToDiaphragmEccentricity: Math.max(0, ...rows.map((row) => hypot(row.eccentricity?.massToDiaphragm))),
    },
  };
}

function hypot(offset) {
  if (!offset) return 0;
  return Math.hypot(Number(offset.x) || 0, Number(offset.y) || 0);
}
