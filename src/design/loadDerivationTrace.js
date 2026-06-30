import { DEFAULT_DESIGN_BASIS } from './designBasisInput.js';
import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
import { finite, rounded } from './loadMath.js';
import { signedAccidentalVariants } from './signedAccidentalVariants.js';

export const LOAD_DERIVATION_TRACE_VERSION = 'm48-load-derivation-trace';

export function buildLoadDerivationTrace(estimation) {
  if (!estimation) {
    return {
      version: LOAD_DERIVATION_TRACE_VERSION,
      rows: [],
      summary: { rowCount: 0, groups: [] },
    };
  }
  return buildLoadDerivationTraceFromParts({
    basis: estimation.basis || {},
    geometry: estimation.geometry || { size: {} },
    storyDeadLoads: estimation.storyLoads?.gravity?.map((row) => ({
      story: row.story,
      z: row.z,
      area: row.area,
      intensity: row.deadIntensity,
      total: row.deadTotal,
      beamLength: row.beamLength,
      beamCount: row.beamCount,
    })) || [],
    storyLiveLoads: estimation.storyLoads?.gravity?.map((row) => ({
      story: row.story,
      z: row.z,
      area: row.area,
      intensity: row.liveIntensity,
      total: row.liveTotal,
      beamLength: row.beamLength,
      beamCount: row.beamCount,
    })) || [],
    storyLateralLoads: estimation.storyLoads?.lateral || [],
    seismicSummary: computeSeismicBaseShear(estimation.storyLoads?.lateral || [], estimation.basis || {}),
    storyMassSummary: estimation.storyMassSummary,
  });
}

export function buildLoadDerivationTraceFromParts(parts) {
  const {
    basis,
    geometry,
    storyDeadLoads,
    storyLiveLoads,
    storyLateralLoads,
    seismicSummary,
    storyMassSummary,
  } = parts;
  const rows = [
    traceRow('basis-occupancy', 'basis', null, null, 'Occupancy preset', 'occupancy preset lookup', [
      inputValue('occupancy', 'Occupancy', basis.occupancy || 'office'),
    ], basis.occupancyLabel || basis.occupancy || 'Office', ''),
    traceRow('basis-plan-area', 'basis', null, null, 'Typical floor area', 'max(model width * model depth, 1)', [
      inputValue('Bx', 'Model width X', geometry.size?.x || 0, 'm'),
      inputValue('By', 'Model depth Y', geometry.size?.y || 0, 'm'),
    ], storyDeadLoads[0]?.area || 0, 'm2'),
    traceRow('basis-roof-area', 'basis', null, null, 'Roof area', 'roofArea input or typical floor area', [
      inputValue('roofArea', 'Roof area input', basis.roofArea || null, 'm2'),
    ], storyDeadLoads.at(-1)?.area || 0, 'm2'),
  ];

  for (const [index, dead] of storyDeadLoads.entries()) {
    const live = storyLiveLoads[index] || {};
    const lateral = storyLateralLoads[index] || {};
    const storyHeight = finite(lateral.storyHeight, 0);
    const windX = finite(lateral.windX, 0);
    const windY = finite(lateral.windY, 0);
    rows.push(traceRow(`D-ST${dead.story}`, 'gravity', dead.story, 'D', 'Story dead load', 'A * qD', [
      inputValue('A', 'Area', dead.area, 'm2'),
      inputValue('qD', 'Dead intensity', dead.intensity, 'kN/m2'),
    ], dead.total, 'kN'));
    rows.push(traceRow(`L-ST${dead.story}`, 'gravity', dead.story, 'L', 'Story live load', 'A * qL', [
      inputValue('A', 'Area', live.area ?? dead.area, 'm2'),
      inputValue('qL', 'Live intensity', live.intensity, 'kN/m2'),
    ], live.total, 'kN'));
    rows.push(traceRow(`WX-ST${dead.story}`, 'wind', dead.story, 'WX', 'Story wind X', 'pWX * By * h', [
      inputValue('pWX', 'Wind pressure X', basis.windPressureX, 'kN/m2'),
      inputValue('By', 'Model depth Y', geometry.size?.y || 0, 'm'),
      inputValue('h', 'Story height', storyHeight, 'm'),
    ], windX, 'kN'));
    rows.push(traceRow(`WY-ST${dead.story}`, 'wind', dead.story, 'WY', 'Story wind Y', 'pWY * Bx * h', [
      inputValue('pWY', 'Wind pressure Y', basis.windPressureY, 'kN/m2'),
      inputValue('Bx', 'Model width X', geometry.size?.x || 0, 'm'),
      inputValue('h', 'Story height', storyHeight, 'm'),
    ], windY, 'kN'));
  }

  rows.push(traceRow('EX-BASE', 'seismic', null, 'EX', 'Seismic base shear X', 'CsX * sum(Wi)', [
    inputValue('CsX', 'Seismic coefficient X', basis.seismicCoefficientX, 'g'),
    inputValue('sumW', 'Effective seismic weight', seismicSummary.totalWeight, 'kN'),
  ], seismicSummary.baseShearX, 'kN'));
  rows.push(traceRow('EY-BASE', 'seismic', null, 'EY', 'Seismic base shear Y', 'CsY * sum(Wi)', [
    inputValue('CsY', 'Seismic coefficient Y', basis.seismicCoefficientY, 'g'),
    inputValue('sumW', 'Effective seismic weight', seismicSummary.totalWeight, 'kN'),
  ], seismicSummary.baseShearY, 'kN'));

  for (const item of storyLateralLoads) {
    const factor = item.effectiveWeight * Math.max(item.z, 0) / seismicSummary.denominator;
    const storySeismicX = seismicSummary.baseShearX * factor;
    const storySeismicY = seismicSummary.baseShearY * factor;
    rows.push(traceRow(`EX-ST${item.story}`, 'seismic', item.story, 'EX', 'Story seismic X', 'Vx * Wi * zi / sum(Wi * zi)', [
      inputValue('Vx', 'Base shear X', seismicSummary.baseShearX, 'kN'),
      inputValue('Wi', 'Effective story weight', item.effectiveWeight, 'kN'),
      inputValue('zi', 'Story elevation', item.z, 'm'),
    ], storySeismicX, 'kN'));
    rows.push(traceRow(`EY-ST${item.story}`, 'seismic', item.story, 'EY', 'Story seismic Y', 'Vy * Wi * zi / sum(Wi * zi)', [
      inputValue('Vy', 'Base shear Y', seismicSummary.baseShearY, 'kN'),
      inputValue('Wi', 'Effective story weight', item.effectiveWeight, 'kN'),
      inputValue('zi', 'Story elevation', item.z, 'm'),
    ], storySeismicY, 'kN'));
  }

  for (const [index, dead] of storyDeadLoads.entries()) {
    const live = storyLiveLoads[index] || {};
    const lateral = storyLateralLoads[index] || {};
    const story = dead.story;
    const nodeCount = Math.max(1, finite(lateral.nodeCount, 0));
    const seismicFactor = finite(lateral.effectiveWeight, 0) * Math.max(finite(lateral.z, 0), 0) / seismicSummary.denominator;
    const storySeismicX = seismicSummary.baseShearX * seismicFactor;
    const storySeismicY = seismicSummary.baseShearY * seismicFactor;
    rows.push(traceRow(`D-DIST-ST${story}`, 'distribution', story, 'D', 'Dead load member UDL distribution', 'Dstory / sum(Lbeam)', [
      inputValue('Dstory', 'Story dead load', dead.total, 'kN'),
      inputValue('sumL', 'Total horizontal member length', dead.beamLength, 'm'),
      inputValue('nBeam', 'Horizontal member count', dead.beamCount || 0, ''),
    ], safeDivide(dead.total, dead.beamLength), 'kN/m'));
    rows.push(traceRow(`L-DIST-ST${story}`, 'distribution', story, 'L', 'Live load member UDL distribution', 'Lstory / sum(Lbeam)', [
      inputValue('Lstory', 'Story live load', live.total, 'kN'),
      inputValue('sumL', 'Total horizontal member length', live.beamLength ?? dead.beamLength, 'm'),
      inputValue('nBeam', 'Horizontal member count', live.beamCount ?? dead.beamCount ?? 0, ''),
    ], safeDivide(live.total, live.beamLength ?? dead.beamLength), 'kN/m'));
    rows.push(traceRow(`WX-NODE-ST${story}`, 'distribution', story, 'WX', 'Wind X nodal distribution', lateralFormula('WX', lateral, basis, geometry), [
      inputValue('WXstory', 'Story wind X', lateral.windX, 'kN'),
      inputValue('nNodes', 'Nodes at story level', nodeCount, ''),
      ...eccentricInputs('WX', lateral, basis, geometry),
    ], safeDivide(lateral.windX, nodeCount), 'kN/node'));
    rows.push(traceRow(`WY-NODE-ST${story}`, 'distribution', story, 'WY', 'Wind Y nodal distribution', lateralFormula('WY', lateral, basis, geometry), [
      inputValue('WYstory', 'Story wind Y', lateral.windY, 'kN'),
      inputValue('nNodes', 'Nodes at story level', nodeCount, ''),
      ...eccentricInputs('WY', lateral, basis, geometry),
    ], safeDivide(lateral.windY, nodeCount), 'kN/node'));
    rows.push(traceRow(`EX-NODE-ST${story}`, 'distribution', story, 'EX', 'Seismic X nodal distribution', lateralFormula('EX', lateral, basis, geometry), [
      inputValue('EXstory', 'Story seismic X', storySeismicX, 'kN'),
      inputValue('nNodes', 'Nodes at story level', nodeCount, ''),
      ...eccentricInputs('EX', lateral, basis, geometry),
    ], safeDivide(storySeismicX, nodeCount), 'kN/node'));
    rows.push(traceRow(`EY-NODE-ST${story}`, 'distribution', story, 'EY', 'Seismic Y nodal distribution', lateralFormula('EY', lateral, basis, geometry), [
      inputValue('EYstory', 'Story seismic Y', storySeismicY, 'kN'),
      inputValue('nNodes', 'Nodes at story level', nodeCount, ''),
      ...eccentricInputs('EY', lateral, basis, geometry),
    ], safeDivide(storySeismicY, nodeCount), 'kN/node'));
    rows.push(...signedDistributionRows(story, lateral, basis, geometry, {
      WX: lateral.windX,
      WY: lateral.windY,
      EX: storySeismicX,
      EY: storySeismicY,
    }, nodeCount));
  }

  return {
    version: LOAD_DERIVATION_TRACE_VERSION,
    rows,
    summary: {
      rowCount: rows.length,
      groups: [...new Set(rows.map((row) => row.group))],
      storyCount: storyDeadLoads.length,
      distributionRowCount: rows.filter((row) => row.group === 'distribution').length,
      storyMassVersion: storyMassSummary?.version || null,
    },
  };
}

export function computeSeismicBaseShear(storyLoads, basis) {
  const denominator = storyLoads.reduce((sum, item) => sum + item.effectiveWeight * Math.max(item.z, 0), 0) || 1;
  const totalWeight = storyLoads.reduce((sum, item) => sum + item.effectiveWeight, 0);
  return {
    denominator,
    totalWeight,
    baseShearX: totalWeight * finite(basis.seismicCoefficientX, DEFAULT_DESIGN_BASIS.seismicCoefficientX),
    baseShearY: totalWeight * finite(basis.seismicCoefficientY, DEFAULT_DESIGN_BASIS.seismicCoefficientY),
  };
}

function traceRow(id, group, story, caseId, label, formula, inputs, result, unit) {
  return {
    id,
    group,
    story,
    caseId,
    label,
    formula,
    inputs,
    result: rounded(result),
    unit,
    source: LOAD_ESTIMATION_VERSION,
  };
}

function inputValue(symbol, label, value, unit = '') {
  return {
    symbol,
    label,
    value: value == null ? null : rounded(value),
    unit,
  };
}

function safeDivide(numerator, denominator) {
  const top = finite(numerator, 0);
  const bottom = finite(denominator, 0);
  return Math.abs(bottom) > 1e-12 ? top / bottom : 0;
}

function lateralFormula(caseId, lateral, basis, geometry) {
  return hasEccentricity(caseId, lateral, basis, geometry) ? `${caseId}story / nNodes + Mz * r / sum(r2)` : `${caseId}story / nNodes`;
}

function eccentricInputs(caseId, lateral, basis, geometry) {
  if (!hasEccentricity(caseId, lateral, basis, geometry)) return [];
  const axis = caseId.endsWith('X') ? 'y' : 'x';
  const base = Number(lateral.eccentricity?.massToDiaphragm?.[axis] || 0);
  const accidental = accidentalOffset(caseId, basis, geometry);
  return [
    inputValue('e0', `Mass-to-diaphragm eccentricity ${axis.toUpperCase()}`, base, 'm'),
    inputValue('ea', 'Accidental eccentricity', accidental, 'm'),
    inputValue('e', 'Effective eccentricity', base + accidental, 'm'),
    inputValue('m', 'Story mass', lateral.mass, 'kN.s2/m'),
  ];
}

function hasEccentricity(caseId, lateral, basis, geometry) {
  if (!hasDistributionCenters(lateral)) return false;
  const axis = caseId.endsWith('X') ? 'y' : 'x';
  return Math.abs(Number(lateral?.eccentricity?.massToDiaphragm?.[axis] || 0) + accidentalOffset(caseId, basis, geometry)) > 1e-9;
}

function hasDistributionCenters(lateral) {
  return Number.isFinite(lateral?.massCenter?.x)
    && Number.isFinite(lateral?.massCenter?.y)
    && Number.isFinite(lateral?.diaphragmCenter?.x)
    && Number.isFinite(lateral?.diaphragmCenter?.y);
}

function accidentalOffset(caseId, basis, geometry) {
  const ratio = Math.max(0, Number(basis?.accidentalEccentricityRatio || 0));
  const dimension = caseId.endsWith('X') ? geometry.size?.y || 0 : geometry.size?.x || 0;
  return ratio * dimension;
}

function signedDistributionRows(story, lateral, basis, geometry, forces, nodeCount) {
  if (!hasDistributionCenters(lateral) || Math.max(0, Number(basis?.accidentalEccentricityRatio || 0)) <= 0) return [];
  return ['WX', 'WY', 'EX', 'EY'].flatMap((baseCase) => signedAccidentalVariants(baseCase).map((variant) => traceRow(
    `${variant.caseId}-NODE-ST${story}`,
    'distribution',
    story,
    variant.caseId,
    `${baseCase} accidental ${variant.sign > 0 ? 'plus' : 'minus'} nodal distribution`,
    `${baseCase}story / nNodes + Mz * r / sum(r2)`,
    [
      inputValue(`${baseCase}story`, `Story ${baseCase}`, forces[baseCase], 'kN'),
      inputValue('nNodes', 'Nodes at story level', nodeCount, ''),
      ...eccentricInputsForSign(baseCase, lateral, basis, geometry, variant.sign),
    ],
    safeDivide(forces[baseCase], nodeCount),
    'kN/node',
  )));
}

function eccentricInputsForSign(caseId, lateral, basis, geometry, sign) {
  const axis = caseId.endsWith('X') ? 'y' : 'x';
  const base = Number(lateral.eccentricity?.massToDiaphragm?.[axis] || 0);
  const accidental = accidentalOffset(caseId, basis, geometry) * sign;
  return [
    inputValue('e0', `Mass-to-diaphragm eccentricity ${axis.toUpperCase()}`, base, 'm'),
    inputValue('ea', 'Accidental eccentricity', accidental, 'm'),
    inputValue('e', 'Effective eccentricity', base + accidental, 'm'),
    inputValue('m', 'Story mass', lateral.mass, 'kN.s2/m'),
  ];
}
