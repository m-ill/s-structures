import { applyFiberStrain, buildRectangularFiberSection } from './fiberSection.js';

export const MOMENT_CURVATURE_VERSION = 'p3-m16-moment-curvature';

export function computeMomentCurvature(section = buildRectangularFiberSection(), options = {}) {
  const curvatures = options.curvatures || [0, 0.0005, 0.001, 0.0015, 0.002];
  const rows = curvatures.map((curvature) => {
    const strained = applyFiberStrain(section, { curvature, axialStrain: options.axialStrain || 0, materials: options.materials });
    return {
      curvature,
      axialForce: sum(strained.fibers, 'force'),
      moment: sum(strained.fibers, 'moment'),
      extremeStrain: Math.max(0, ...strained.fibers.map((fiber) => Math.abs(fiber.strain))),
    };
  });
  return {
    version: MOMENT_CURVATURE_VERSION,
    sectionType: section.type,
    rows,
    yieldMoment: Math.max(0, ...rows.map((row) => Math.abs(row.moment))),
  };
}

export function compareMomentCurvatureTheory(trace, theory = {}) {
  const actual = Math.max(0, ...((trace?.rows || []).map((row) => Math.abs(row.moment))));
  const expected = Number(theory.expectedMoment ?? actual);
  const errorRatio = Math.abs(actual - expected) / Math.max(1e-12, Math.abs(expected));
  return { version: MOMENT_CURVATURE_VERSION, actual, expected, errorRatio, ok: errorRatio <= Number(theory.tolerance ?? 0.02) };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}
