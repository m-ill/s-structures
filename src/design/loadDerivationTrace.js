import { DEFAULT_DESIGN_BASIS } from './designBasisInput.js';
import { LOAD_ESTIMATION_VERSION } from './loadEstimationConstants.js';
import { finite, rounded } from './loadMath.js';

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
    })) || [],
    storyLiveLoads: estimation.storyLoads?.gravity?.map((row) => ({
      story: row.story,
      z: row.z,
      area: row.area,
      intensity: row.liveIntensity,
      total: row.liveTotal,
      beamLength: row.beamLength,
    })) || [],
    storyLateralLoads: estimation.storyLoads?.lateral || [],
    seismicSummary: computeSeismicBaseShear(estimation.storyLoads?.lateral || [], estimation.basis || {}),
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
      inputValue('h', 'Story height', lateral.storyHeight, 'm'),
    ], lateral.windX, 'kN'));
    rows.push(traceRow(`WY-ST${dead.story}`, 'wind', dead.story, 'WY', 'Story wind Y', 'pWY * Bx * h', [
      inputValue('pWY', 'Wind pressure Y', basis.windPressureY, 'kN/m2'),
      inputValue('Bx', 'Model width X', geometry.size?.x || 0, 'm'),
      inputValue('h', 'Story height', lateral.storyHeight, 'm'),
    ], lateral.windY, 'kN'));
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
    rows.push(traceRow(`EX-ST${item.story}`, 'seismic', item.story, 'EX', 'Story seismic X', 'Vx * Wi * zi / sum(Wi * zi)', [
      inputValue('Vx', 'Base shear X', seismicSummary.baseShearX, 'kN'),
      inputValue('Wi', 'Effective story weight', item.effectiveWeight, 'kN'),
      inputValue('zi', 'Story elevation', item.z, 'm'),
    ], seismicSummary.baseShearX * factor, 'kN'));
    rows.push(traceRow(`EY-ST${item.story}`, 'seismic', item.story, 'EY', 'Story seismic Y', 'Vy * Wi * zi / sum(Wi * zi)', [
      inputValue('Vy', 'Base shear Y', seismicSummary.baseShearY, 'kN'),
      inputValue('Wi', 'Effective story weight', item.effectiveWeight, 'kN'),
      inputValue('zi', 'Story elevation', item.z, 'm'),
    ], seismicSummary.baseShearY * factor, 'kN'));
  }

  return {
    version: LOAD_DERIVATION_TRACE_VERSION,
    rows,
    summary: {
      rowCount: rows.length,
      groups: [...new Set(rows.map((row) => row.group))],
      storyCount: storyDeadLoads.length,
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
