export const LOADS_V2_VERSION = 'p3-m13-loads-v2-trace';

export function buildLoadsV2Trace(model = {}, basis = {}) {
  const stories = model.stories?.length ? model.stories : inferStories(model.nodes || []);
  const windBase = Number(basis.windPressure || 0.8);
  const seismicBase = Number(basis.seismicBaseShear || 100);
  const seismicRows = distributeSeismic(stories, seismicBase);
  const rsaScaling = basis.dynamicBaseShear || basis.staticBaseShear
    ? scaleRsaBaseShear(basis.dynamicBaseShear || 0, basis.staticBaseShear || seismicBase, basis.minDynamicRatio)
    : null;
  const torsionAx = basis.torsion ? computeTorsionAmplificationAx(basis.torsion) : null;
  const environmental = generateEnvironmentalLoadsV2(model, basis.environmental || basis);
  return {
    version: LOADS_V2_VERSION,
    wind: buildWindRows(stories, windBase, basis),
    seismic: seismicRows.map((row) => ({ ...row, rsaScale: rsaScaling?.scaleFactor ?? 1, torsionAx: torsionAx?.Ax ?? 1 })),
    rsaScaling,
    torsionAx,
    environmental,
    other: environmental.summary,
  };
}

export function buildWindRows(stories, pressure, basis = {}) {
  const importance = finite(basis.windImportance, 1);
  const exposure = finite(basis.exposureFactor, 1);
  return stories.map((story, i) => {
    const height = finite(story.height ?? story.z ?? story.elevation, i ? 3 : 0);
    const qz = pressure * importance * exposure * Math.max(1, height || 1);
    return { story: story.id || `S${i + 1}`, qz, force: qz * finite(story.tributaryWidth, 1), formula: 'qz=pressure*importance*exposure*height' };
  });
}

export function scaleRsaBaseShear(dynamicBaseShear, staticBaseShear, minRatio = 0.85) {
  const dynamic = Math.max(0, Number(dynamicBaseShear) || 0);
  const staticShear = Math.max(0, Number(staticBaseShear) || 0);
  const target = staticShear * finite(minRatio, 0.85);
  const scaleFactor = dynamic > 0 && dynamic < target ? target / dynamic : 1;
  return { dynamicBaseShear: dynamic, staticBaseShear: staticShear, minRatio: finite(minRatio, 0.85), target, scaleFactor, formula: 'Vdyn >= minRatio*Vstatic' };
}

export function computeTorsionAmplificationAx({ maxDrift = 0, avgDrift = 0, limit = 3 } = {}) {
  const ratio = finite(maxDrift, 0) / Math.max(1e-12, 1.2 * finite(avgDrift, 0));
  const Ax = Math.min(Math.max(1, ratio * ratio), finite(limit, 3));
  return { Ax, ratio, formula: 'Ax=(deltaMax/(1.2*deltaAvg))^2, bounded' };
}

export function generateEnvironmentalLoadsV2(model = {}, basis = {}) {
  const nodes = model.nodes || [];
  const topZ = Math.max(0, ...nodes.map((node) => finite(node.z, 0)));
  const baseZ = Math.min(0, ...nodes.map((node) => finite(node.z, 0)));
  const loads = [];
  for (const node of nodes) {
    if (near(finite(node.z, 0), topZ) && basis.snowLoad) loads.push(nodal(node.id, 'S', 0, 0, -Number(basis.snowLoad)));
    if (near(finite(node.z, 0), baseZ) && basis.uplift) loads.push(nodal(node.id, 'U', 0, 0, Number(basis.uplift)));
    if (finite(node.z, 0) <= finite(basis.retainingElevation, baseZ) && basis.soilPressure) loads.push(nodal(node.id, 'H', Number(basis.soilPressure), 0, 0));
    if (finite(node.z, 0) <= finite(basis.waterElevation, baseZ) && basis.waterPressure) loads.push(nodal(node.id, 'F', Number(basis.waterPressure), 0, 0));
  }
  return {
    loadCases: [...new Set(loads.map((load) => load.case))],
    loads,
    summary: {
      snow: finite(basis.snowLoad, 0),
      soil: finite(basis.soilPressure, 0),
      water: finite(basis.waterPressure, 0),
      uplift: finite(basis.uplift, 0),
    },
    formula: 'nodal preliminary distribution from roof/base/retaining elevations',
  };
}

function inferStories(nodes) {
  return [...new Set(nodes.map((node) => Number(node.z || 0)).sort((a, b) => a - b))].map((z, i, arr) => ({ id: `S${i + 1}`, z, height: i ? z - arr[i - 1] : 0 }));
}

function distributeSeismic(stories, baseShear) {
  const rows = stories.map((story, i) => {
    const height = finite(story.z ?? story.elevation ?? story.height, i + 1);
    const weight = finite(story.seismicWeight ?? story.weight ?? story.mass, 1);
    const wh = height > 0 && weight > 0 ? weight * height : 0;
    return { story: story.id || `S${i + 1}`, height, weight, wh };
  });
  const denominator = rows.reduce((sum, row) => sum + row.wh, 0) || 1;
  return rows.map((row) => ({
    story: row.story,
    force: row.wh > 0 ? baseShear * row.wh / denominator : 0,
    formula: 'V*wi*hi/sum(wi*hi)',
    weight: row.weight,
    height: row.height,
  }));
}

function nodal(node, caseName, fx, fy, fz) {
  return { type: 'nodal', node, case: caseName, fx, fy, fz };
}

function near(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
