import { expandAdvancedLoads } from '../solver/elasticExpansion.js';

export const LOADS_V2_VERSION = 'p3-m13-loads-v2-trace';
export const MASS_SOURCE_TRACE_VERSION = 'p3-m13-mass-source-trace-v1';

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
  const massSource = buildMassSourceTrace(model, basis.massSource || model.analysisSettings?.massSource || null);
  return {
    version: LOADS_V2_VERSION,
    wind: buildWindRows(stories, windBase, basis),
    seismic: seismicRows.map((row) => ({ ...row, rsaScale: rsaScaling?.scaleFactor ?? 1, torsionAx: torsionAx?.Ax ?? 1 })),
    rsaScaling,
    torsionAx,
    environmental,
    massSource,
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

export function buildMassSourceTrace(model = {}, massSource = null) {
  const spec = massSource || { combos: [], includeNodeMass: true };
  const combos = Array.isArray(spec.combos) ? spec.combos : [];
  const g = finite(spec.gravity, 9.80665);
  const nodeRows = new Map();
  const ignored = [];
  if (spec.includeNodeMass !== false) {
    for (const node of model.nodes || []) {
      const mass = nodeMassValue(node.mass);
      if (mass > 0) addMass(nodeRows, node.id, mass, 'node.mass');
    }
  }
  const expanded = expandAdvancedLoads(model.loads || [], model).loads;
  const memberNodes = Object.fromEntries((model.members || []).map((m) => [m.id, [m.n1, m.n2]]));
  const memberLengths = buildMemberLengths(model);
  for (const load of expanded) {
    const factor = comboFactor(load.case, combos);
    if (!factor) continue;
    const vertical = verticalLoad(load, memberLengths[load.member] || 0);
    if (!vertical) {
      ignored.push({ id: load.id || null, type: load.type || null, reason: 'not-vertical-load' });
      continue;
    }
    const mass = Math.abs(vertical * factor) / g;
    if (load.node) addMass(nodeRows, load.node, mass, `load:${load.case || 'LC1'}`);
    else if (load.member && memberNodes[load.member]) {
      const [a, b] = memberNodes[load.member];
      addMass(nodeRows, a, mass / 2, `member-load:${load.case || 'LC1'}`);
      addMass(nodeRows, b, mass / 2, `member-load:${load.case || 'LC1'}`);
    } else {
      ignored.push({ id: load.id || null, type: load.type || null, reason: 'no-node-or-member-target' });
    }
  }
  const rows = [...nodeRows.values()].sort((a, b) => String(a.node).localeCompare(String(b.node)));
  return {
    version: MASS_SOURCE_TRACE_VERSION,
    gravity: g,
    combos,
    includeNodeMass: spec.includeNodeMass !== false,
    totalMass: rows.reduce((sum, row) => sum + row.mass, 0),
    nodeCount: rows.length,
    rows,
    ignored,
    limitations: [
      'Mass source converts vertical nodal/member loads only.',
      'Generated mass is an analysis trace and does not mutate node.mass automatically.',
    ],
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

function comboFactor(caseName = 'LC1', combos = []) {
  const row = combos.find((item) => item.case === caseName);
  return row ? finite(row.factor, 0) : 0;
}

function verticalLoad(load = {}, memberLength = 0) {
  if (load.fz != null) return Number(load.fz);
  if (load.P != null && ['-z', '+z', 'z'].includes(String(load.dir || load.direction || '').toLowerCase())) {
    const sign = String(load.dir || load.direction).startsWith('+') ? 1 : -1;
    return sign * Math.abs(Number(load.P));
  }
  if (load.w != null && ['-z', '+z', 'z'].includes(String(load.dir || load.direction || '').toLowerCase())) {
    const sign = String(load.dir || load.direction).startsWith('+') ? 1 : -1;
    const length = Math.max(0, Number(memberLength) || 0);
    return sign * Math.abs(Number(load.w)) * length;
  }
  return 0;
}

function buildMemberLengths(model = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const out = {};
  for (const member of model.members || []) {
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (a && b) out[member.id] = Math.hypot(
      finite(b.x, 0) - finite(a.x, 0),
      finite(b.y, 0) - finite(a.y, 0),
      finite(b.z, 0) - finite(a.z, 0),
    );
  }
  return out;
}

function nodeMassValue(mass) {
  if (Array.isArray(mass)) return Math.max(0, ...mass.map((value) => finite(value, 0)));
  return Math.max(0, finite(mass, 0));
}

function addMass(rows, node, mass, source) {
  if (!node || !(mass > 0)) return;
  const row = rows.get(node) || { node, mass: 0, sources: [] };
  row.mass += mass;
  if (!row.sources.includes(source)) row.sources.push(source);
  rows.set(node, row);
}

function near(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
