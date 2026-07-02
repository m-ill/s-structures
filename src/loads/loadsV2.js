import { expandAdvancedLoads } from '../solver/elasticExpansion.js';

export const LOADS_V2_VERSION = 'p3-m13-loads-v2-trace';
export const MASS_SOURCE_TRACE_VERSION = 'p3-m13-mass-source-trace-v1';

export function buildLoadsV2Trace(model = {}, basis = {}) {
  const stories = model.stories?.length ? model.stories : inferStories(model.nodes || []);
  const basisInputs = buildBasisInputTrace(basis, model);
  const windBase = finite(basis.windPressure, 0);
  const seismicBase = finite(basis.seismicBaseShear, 0);
  const seismicRows = distributeSeismic(stories, seismicBase);
  const rsaScaling = basis.dynamicBaseShear || basis.staticBaseShear
    ? scaleRsaBaseShear(basis.dynamicBaseShear || 0, basis.staticBaseShear || seismicBase, basis.minDynamicRatio)
    : null;
  const torsionAx = basis.torsion ? computeTorsionAmplificationAx(basis.torsion) : null;
  const environmental = generateEnvironmentalLoadsV2(model, basis.environmental || basis);
  const massSource = buildMassSourceTrace(model, basis.massSource || model.analysisSettings?.massSource || null);
  const wind = buildWindRows(stories, windBase, basis);
  const seismic = seismicRows.map((row) => ({ ...row, rsaScale: rsaScaling?.scaleFactor ?? 1, torsionAx: torsionAx?.Ax ?? 1 }));
  const summary = summarizeLoadsV2({ wind, seismic, environmental, massSource, basisInputs });
  return {
    version: LOADS_V2_VERSION,
    contract: buildLoadsV2Contract(),
    summary,
    review: buildLoadsV2Review(summary, massSource),
    basisInputs,
    wind,
    seismic,
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
    const tributaryWidth = finite(story.tributaryWidth, 1);
    const qz = pressure * importance * exposure * Math.max(1, height || 1);
    return {
      story: story.id || `S${i + 1}`,
      pressure,
      importance,
      exposure,
      height,
      tributaryWidth,
      qz,
      force: qz * tributaryWidth,
      formula: 'qz=pressure*importance*exposure*height; F=qz*tributaryWidth',
    };
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
  const skipped = [];
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
    if (!factor) {
      skipped.push({ id: load.id || null, type: load.type || null, case: load.case || 'LC1', reason: 'outside-mass-source-combo' });
      continue;
    }
    const vertical = verticalLoadInfo(load, memberLengths[load.member] || 0);
    if (!vertical.ok) {
      ignored.push({ id: load.id || null, type: load.type || null, reason: vertical.reason });
      continue;
    }
    const mass = Math.abs(vertical.value * factor) / g;
    if (!(mass > 0)) {
      skipped.push({ id: load.id || null, type: load.type || null, case: load.case || 'LC1', reason: 'zero-vertical-load' });
      continue;
    }
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
  const totalMass = rows.reduce((sum, row) => sum + row.mass, 0);
  return {
    version: MASS_SOURCE_TRACE_VERSION,
    contract: {
      tickets: ['P3-T82'],
      scope: 'Convert selected vertical load cases to lumped nodal mass for elastic dynamics.',
      gravityUnit: 'force divided by acceleration',
      acceptedLoads: ['node.mass', 'vertical nodal force', 'vertical member point force', 'vertical member uniform load'],
      ignoredLoads: 'non-vertical loads',
      skippedLoads: 'loads outside the active mass-source combination and zero vertical loads',
    },
    gravity: g,
    combos,
    includeNodeMass: spec.includeNodeMass !== false,
    totalMass,
    nodeCount: rows.length,
    rows,
    ignored,
    skipped,
    review: buildMassSourceReview({ rows, ignored, skipped, totalMass }),
    limitations: [
      'Mass source converts vertical nodal/member loads only.',
      'Generated mass is an analysis trace and does not mutate node.mass automatically.',
    ],
  };
}

function buildMassSourceReview({ rows, ignored, skipped, totalMass }) {
  const ignoredReasons = [...new Set((ignored || []).map((row) => row.reason).filter(Boolean))].sort();
  const skippedReasons = [...new Set((skipped || []).map((row) => row.reason).filter(Boolean))].sort();
  return {
    status: totalMass > 0 ? 'available' : 'empty',
    acceptedNodeCount: rows.length,
    ignoredLoadCount: ignored.length,
    ignoredReasons,
    skippedLoadCount: skipped.length,
    skippedReasons,
    warning: ignored.length > 0 ? 'mass-source-has-ignored-loads' : null,
    agentDecision: totalMass > 0 && ignored.length === 0
      ? 'mass-source-ready'
      : totalMass > 0
        ? 'mass-source-ready-with-ignored-load-review'
        : 'mass-source-empty-review-required',
  };
}

function inferStories(nodes) {
  return [...new Set(nodes.map((node) => Number(node.z || 0)).sort((a, b) => a - b))].map((z, i, arr) => ({ id: `S${i + 1}`, z, height: i ? z - arr[i - 1] : 0 }));
}

function buildLoadsV2Contract() {
  return {
    milestone: 'P3-M13',
    tickets: ['P3-T76', 'P3-T77', 'P3-T78', 'P3-T82'],
    scope: 'Traceable preliminary wind, seismic, environmental, and mass-source loads for elastic analysis.',
    featureTicketMap: {
      windV2: 'P3-T76',
      seismicV2: 'P3-T77',
      environmentalLoads: 'P3-T78',
      massSource: 'P3-T82',
    },
    reviewFields: ['summary.ticketCoverage', 'wind', 'seismic', 'environmental', 'massSource'],
    standardBasis: {
      wind: 'KDS 41 12 preliminary trace inputs',
      seismic: 'KDS 41 17 preliminary trace inputs',
      environmental: 'KDS environmental load preliminary trace inputs',
      massSource: 'D plus live-load factor mass-source trace',
    },
    reportUse: 'Rows preserve formula inputs so reports and agents can cite the active basis without re-reading UI state.',
    limitations: [
      'Project-specific code automation and exceptional wind shapes remain outside this trace.',
      'Mass source is vertical-load based and does not mutate model node mass.',
    ],
  };
}

function summarizeLoadsV2({ wind, seismic, environmental, massSource, basisInputs }) {
  const windForce = sum(wind, 'force');
  const seismicForce = sum(seismic, 'force');
  const windCovered = windForce > 0 && basisInputs.windPressureProvided;
  const seismicCovered = seismicForce > 0 && basisInputs.seismicBaseShearProvided;
  const environmentalCovered = environmental.loads.length > 0 && basisInputs.environmentalBasisProvided;
  return {
    storyCount: Math.max(wind.length, seismic.length),
    windForce,
    seismicForce,
    environmentalLoadCount: environmental.loads.length,
    environmentalCases: environmental.loadCases,
    massNodeCount: massSource.nodeCount,
    totalMass: massSource.totalMass,
    ticketCoverage: [
      { ticket: 'P3-T76', scope: 'wind v2 trace', covered: windCovered, evidence: `${wind.length} story wind rows / ${windForce} total force` },
      { ticket: 'P3-T77', scope: 'seismic v2 trace', covered: seismicCovered, evidence: `${seismic.length} story seismic rows / ${seismicForce} total force` },
      { ticket: 'P3-T78', scope: 'snow soil water uplift loads', covered: environmentalCovered, evidence: environmental.loadCases.join(',') || 'no environmental cases requested' },
      { ticket: 'P3-T82', scope: 'load-to-mass source', covered: massSource.totalMass > 0, evidence: `${massSource.nodeCount} mass nodes / ${massSource.totalMass} total mass` },
    ],
  };
}

function buildLoadsV2Review(summary, massSource) {
  const uncoveredTickets = (summary.ticketCoverage || [])
    .filter((row) => !row.covered)
    .map((row) => row.ticket);
  const blockers = [];
  if (!(summary.windForce > 0)) blockers.push('wind-trace-empty');
  if (!(summary.seismicForce > 0)) blockers.push('seismic-trace-empty');
  const missingBasis = missingBasisInputs(summary);
  blockers.push(...missingBasis);
  if (!massSource?.version) blockers.push('mass-source-trace-missing');
  if (!(summary.totalMass > 0)) blockers.push('mass-source-empty');
  if (massSource?.review?.warning) blockers.push('mass-source-ignored-loads');
  const massSourceIgnoredLoadCount = massSource?.review?.ignoredLoadCount || 0;
  const massSourceReviewWarning = massSource?.review?.warning || null;
  const agentDecision = massSourceReviewWarning
    ? 'review-loads-v2-mass-source-ignored-loads'
    : blockers.length
      ? 'fix-loads-v2-trace-before-review'
      : 'loads-v2-ready-for-engineering-review';
  return {
    status: blockers.length ? 'review-required' : 'available',
    loadsTraceReady: blockers.length === 0,
    windTraceReady: summary.windForce > 0,
    seismicTraceReady: summary.seismicForce > 0,
    environmentalTraceReady: summary.environmentalLoadCount > 0,
    massSourceReady: !!massSource?.version && summary.totalMass > 0,
    massSourceReviewWarning,
    massSourceIgnoredLoadCount,
    uncoveredTickets,
    blockers,
    missingBasis,
    requiredBasis: buildRequiredBasisReview(summary, massSource),
    engineerReviewRequired: true,
    productionReady: false,
    preliminaryCodeAutomation: true,
    agentDecision,
  };
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
    baseShear,
    weight: row.weight,
    height: row.height,
    wh: row.wh,
    sumWh: denominator,
  }));
}

function nodal(node, caseName, fx, fy, fz) {
  return { type: 'nodal', node, case: caseName, fx, fy, fz };
}

function comboFactor(caseName = 'LC1', combos = []) {
  const row = combos.find((item) => item.case === caseName);
  return row ? finite(row.factor, 0) : 0;
}

function buildBasisInputTrace(basis = {}, model = {}) {
  const environmentalKeys = ['snowLoad', 'soilPressure', 'waterPressure', 'uplift'];
  const provided = {
    windPressureProvided: Number.isFinite(Number(basis.windPressure)),
    seismicBaseShearProvided: Number.isFinite(Number(basis.seismicBaseShear)),
    environmentalBasisProvided: environmentalKeys.some((key) => Number.isFinite(Number(basis.environmental?.[key] ?? basis[key]))),
    massSourceProvided: !!(basis.massSource || model.analysisSettings?.massSource),
  };
  return {
    ...provided,
    requiredInputs: [
      { ticket: 'P3-T76', scope: 'wind v2', input: 'windPressure', provided: provided.windPressureProvided, standard: 'KDS 41 12 preliminary' },
      { ticket: 'P3-T77', scope: 'seismic v2', input: 'seismicBaseShear', provided: provided.seismicBaseShearProvided, standard: 'KDS 41 17 preliminary' },
      { ticket: 'P3-T78', scope: 'environmental loads', input: environmentalKeys.join('|'), provided: provided.environmentalBasisProvided, standard: 'KDS environmental preliminary' },
      { ticket: 'P3-T82', scope: 'mass source', input: 'massSource.combos', provided: provided.massSourceProvided, standard: 'load-to-mass preliminary' },
    ],
  };
}

function missingBasisInputs(summary = {}) {
  const coverage = Object.fromEntries((summary.ticketCoverage || []).map((row) => [row.ticket, row.covered]));
  const missing = [];
  if (!coverage['P3-T76']) missing.push('wind-basis-missing-or-empty');
  if (!coverage['P3-T77']) missing.push('seismic-basis-missing-or-empty');
  if (!coverage['P3-T78']) missing.push('environmental-basis-missing-or-empty');
  if (!coverage['P3-T82']) missing.push('mass-source-basis-missing-or-empty');
  return missing;
}

function buildRequiredBasisReview(summary = {}, massSource = null) {
  const missing = new Set(missingBasisInputs(summary));
  return [
    basisRow('P3-T76', 'windPressure', 'wind-basis-missing-or-empty', missing),
    basisRow('P3-T77', 'seismicBaseShear', 'seismic-basis-missing-or-empty', missing),
    basisRow('P3-T78', 'snowLoad|soilPressure|waterPressure|uplift', 'environmental-basis-missing-or-empty', missing),
    {
      ...basisRow('P3-T82', 'massSource.combos', 'mass-source-basis-missing-or-empty', missing),
      warning: massSource?.review?.warning || null,
      ignoredLoadCount: massSource?.review?.ignoredLoadCount || 0,
    },
  ];
}

function basisRow(ticket, input, missingKey, missing) {
  return {
    ticket,
    input,
    status: missing.has(missingKey) ? 'missing-or-empty' : 'available',
    missingKey: missing.has(missingKey) ? missingKey : null,
    engineerReviewRequired: true,
  };
}

function verticalLoadInfo(load = {}, memberLength = 0) {
  if (load.fz != null) return finiteLoad(load.fz, 'vertical-nodal-fz');
  if (load.P != null && ['-z', '+z', 'z'].includes(String(load.dir || load.direction || '').toLowerCase())) {
    const sign = String(load.dir || load.direction).startsWith('+') ? 1 : -1;
    return finiteLoad(sign * Math.abs(Number(load.P)), 'vertical-point-load');
  }
  if (load.w != null && ['-z', '+z', 'z'].includes(String(load.dir || load.direction || '').toLowerCase())) {
    const sign = String(load.dir || load.direction).startsWith('+') ? 1 : -1;
    const length = Math.max(0, Number(memberLength) || 0);
    return finiteLoad(sign * Math.abs(Number(load.w)) * length, 'vertical-uniform-load');
  }
  return { ok: false, reason: 'not-vertical-load' };
}

function finiteLoad(value, reason) {
  const number = Number(value);
  return Number.isFinite(number) ? { ok: true, value: number } : { ok: false, reason };
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

function sum(rows, key) {
  return rows.reduce((total, row) => total + finite(row[key], 0), 0);
}

function near(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
