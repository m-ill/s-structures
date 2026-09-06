import { combineModalResponseValues, normalizeModalCombinationMethod } from '../../dynamics/modalCombination.js';

export const RSA_BASE_SHEAR_SCALE_VERSION = 'p6-m4-rsa-base-shear-scale-v1';
export const RSA_BASE_SHEAR_SCALE_CORRECTNESS_VERSION = 'p7-m9-rsa-base-shear-scale-v1';
export const RSA_BASE_SHEAR_SCALE_APPLICATION_VERSION = 'p10-m0-rsa-base-shear-scale-application-v1';

export function buildBaseShearScaleTrace(input = {}) {
  const rsa = input.rsa || input.analysis?.dynamics?.rsa || null;
  const minima = input.directionMinima || input.minimumBaseShear || {};
  const forceUnit = rsa?.units?.force || rsa?.units?.baseShear || input.forceUnit || 'kN';
  const rows = directionsFrom(rsa, minima).map((direction) => {
    const combined = rsa?.combined?.[direction] || {};
    const modalRows = (rsa?.modal || []).find((row) => row.direction === direction)?.responses || [];
    const recovered = recoverBaseShear(rsa, combined, modalRows);
    const minimum = nonnegativeNumber(
      minima[direction],
      minima[direction.toUpperCase?.() || direction],
      input.designBaseShear,
      0,
    );
    const scale = scaleBaseShear(recovered.value, minimum, recovered.available);
    return {
      direction,
      baseShear: recovered.value,
      beforeBaseShear: recovered.value,
      minimumBaseShear: minimum,
      targetBaseShear: minimum,
      scaleFactor: scale.factor,
      scaledBaseShear: scale.after,
      afterBaseShear: scale.after,
      source: recovered.source,
      responseMethod: recovered.method,
      status: scale.status,
      designBlocked: scale.designBlocked,
      reason: scale.reason || recovered.reason,
      dimension: 'force',
      dimensions: {
        baseShear: 'force',
        minimumBaseShear: 'force',
        scaledBaseShear: 'force',
        scaleFactor: 'dimensionless',
      },
      units: {
        baseShear: forceUnit,
        minimumBaseShear: forceUnit,
        scaledBaseShear: forceUnit,
        scaleFactor: '1',
      },
      provenance: {
        source: 'rsa-base-shear-recovery',
        analysisCaseId: rsa?.provenance?.analysisCaseId || input.analysisCaseId || null,
        direction,
        responseMethod: recovered.method,
        recoverySource: recovered.source,
        staticCaseReferences: [],
      },
    };
  });
  const validFactors = rows.map((row) => row.scaleFactor).filter((value) => Number.isFinite(value));
  const blocked = rows.filter((row) => row.designBlocked);
  const missingResponse = !rsa || rows.length === 0;
  const designBlocked = missingResponse || blocked.length > 0;
  return {
    version: RSA_BASE_SHEAR_SCALE_VERSION,
    correctnessVersion: RSA_BASE_SHEAR_SCALE_CORRECTNESS_VERSION,
    method: 'scale=max(1,V_min/V_RSA)',
    dimension: 'force',
    units: { force: forceUnit, scaleFactor: '1' },
    rows,
    warnings: [
      ...(missingResponse ? ['RSA_BASE_SHEAR_RESPONSE_UNAVAILABLE'] : []),
      ...blocked.map((row) => `${row.direction.toUpperCase()}: ${row.reason}`),
    ],
    designBlocked,
    reason: missingResponse ? 'RSA_BASE_SHEAR_RESPONSE_UNAVAILABLE' : null,
    provenance: {
      source: 'analysis.dynamics.rsa.combined.baseShear',
      staticCaseReferences: [],
    },
    summary: {
      directionCount: rows.length,
      maxScaleFactor: validFactors.length ? Math.max(1, ...validFactors) : null,
      scaledDirections: rows.filter((row) => Number(row.scaleFactor) > 1).map((row) => row.direction),
      blockedDirections: blocked.map((row) => row.direction),
      status: designBlocked ? 'unsupported' : rows.some((row) => row.status === 'NG') ? 'NG' : 'OK',
    },
  };
}

export function applyBaseShearScaling(rsa = {}, input = {}) {
  if (rsa?.baseShearScaling?.application?.resolved) {
    return { combined: rsa.combined || {}, trace: rsa.baseShearScaling };
  }
  const enabled = input.enabled !== false;
  const rawTrace = buildBaseShearScaleTrace({
    ...input,
    rsa,
  });
  const appliedRows = rawTrace.rows.map((row) => {
    const calculated = finiteOrNull(row.scaleFactor);
    const beforeBaseShear = finiteOrNull(row.baseShear);
    const appliedScaleFactor = enabled && calculated != null && calculated > 0 ? calculated : 1;
    const scaling = scalingMetadata(row.baseShear, appliedScaleFactor);
    return {
      ...row,
      appliedScaleFactor,
      appliedBaseShear: beforeBaseShear != null
        ? beforeBaseShear * appliedScaleFactor
        : null,
      provenance: withScalingProvenance(row.provenance, row.baseShear, appliedScaleFactor),
      application: {
        enabled,
        calculatedScaleFactor: calculated,
        ...scaling,
      },
    };
  });
  const factorByDirection = Object.fromEntries(appliedRows.map((row) => [row.direction, row.appliedScaleFactor]));
  const combined = Object.fromEntries(Object.entries(rsa?.combined || {}).map(([direction, row]) => [
    direction,
    scaleCombinedDirection(row, factorByDirection[direction] || 1),
  ]));
  const appliedDirections = appliedRows.filter((row) => row.application.scaled).map((row) => row.direction);
  const trace = {
    ...rawTrace,
    rows: appliedRows,
    application: {
      version: RSA_BASE_SHEAR_SCALE_APPLICATION_VERSION,
      resolved: true,
      enabled,
      applied: appliedDirections.length > 0,
      appliedDirections,
      factorByDirection,
      source: 'analysisCriteria.criteria.rsa.applyBaseShearScaling',
    },
  };
  return { combined, trace };
}

function scaleCombinedDirection(row = {}, factor = 1) {
  const scalarKeys = [
    'displacement',
    'combinedDisplacement',
    'maxModalDisplacement',
    'srssDisplacement',
    'cqcDisplacement',
    'absDisplacement',
    'nrc10Displacement',
    'baseShear',
    'rsaBaseShear',
    'srssBaseShear',
    'cqcBaseShear',
    'absBaseShear',
    'nrc10BaseShear',
  ];
  const arrayKeys = ['displacementVector', 'inertiaForceVector'];
  const componentKeys = [
    'baseShearComponents',
    'srssBaseShearComponents',
    'cqcBaseShearComponents',
    'absBaseShearComponents',
    'nrc10BaseShearComponents',
  ];
  const beforeValue = Object.fromEntries([
    ...scalarKeys,
    ...arrayKeys,
    ...componentKeys,
  ].filter((key) => row[key] != null).map((key) => [key, cloneValue(row[key])]));
  const scaled = { ...row };
  for (const key of scalarKeys) scaled[key] = scaleFinite(row[key], factor);
  for (const key of arrayKeys) scaled[key] = scaleArray(row[key], factor);
  for (const key of componentKeys) scaled[key] = scaleNumericObject(row[key], factor);
  scaled.nodalDisplacements = scaleVectorRows(row.nodalDisplacements, factor);
  scaled.nodalDisplacementsByMethod = scaleRowsByMethod(row.nodalDisplacementsByMethod, factor);
  scaled.nodeDisplacements = scaleNodeVectorMap(row.nodeDisplacements, factor);
  scaled.nodeRotations = scaleNodeVectorMap(row.nodeRotations, factor);
  scaled.nodalInertiaForces = scaleVectorRows(row.nodalInertiaForces, factor);
  scaled.inertiaForces = scaleVectorRows(row.inertiaForces, factor);
  scaled.nodalInertiaForcesByMethod = scaleRowsByMethod(row.nodalInertiaForcesByMethod, factor);
  scaled.nodeInertiaForces = scaleNodeVectorMap(row.nodeInertiaForces, factor);
  scaled.nodeInertiaMoments = scaleNodeVectorMap(row.nodeInertiaMoments, factor);
  scaled.memberForces = scaleMemberForceBlock(row.memberForces, factor);
  scaled.provenance = withScalingProvenance(
    row.provenance,
    beforeValue,
    factor,
    scalarKeys.filter((key) => row[key] != null),
  );
  return scaled;
}

function scaleVectorRows(rows, factor) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const beforeValue = {
      vector: cloneValue(row?.vector),
      rotation: cloneValue(row?.rotation),
      x: row?.x,
      y: row?.y,
      z: row?.z,
    };
    return {
      ...row,
      vector: scaleArray(row?.vector, factor),
      rotation: scaleArray(row?.rotation, factor),
      x: scaleFinite(row?.x, factor),
      y: scaleFinite(row?.y, factor),
      z: scaleFinite(row?.z, factor),
      rx: scaleFinite(row?.rx, factor),
      ry: scaleFinite(row?.ry, factor),
      rz: scaleFinite(row?.rz, factor),
      provenance: withScalingProvenance(row?.provenance, beforeValue, factor, ['x', 'y', 'z']),
    };
  });
}

function scaleRowsByMethod(rowsByMethod, factor) {
  if (!rowsByMethod || typeof rowsByMethod !== 'object') return rowsByMethod;
  return Object.fromEntries(Object.entries(rowsByMethod).map(([method, rows]) => [
    method,
    scaleVectorRows(rows, factor),
  ]));
}

function scaleNodeVectorMap(rowsByNode, factor) {
  if (!rowsByNode || typeof rowsByNode !== 'object') return rowsByNode;
  return Object.fromEntries(Object.entries(rowsByNode).map(([nodeId, vector]) => [
    nodeId,
    scaleArray(vector, factor),
  ]));
}

function scaleMemberForceBlock(block, factor) {
  if (!block || typeof block !== 'object' || block.status === 'unsupported') return block;
  const sourceRows = block.members || block.rows || [];
  const members = sourceRows.map((row) => scaleMemberForceRow(row, factor));
  return {
    ...block,
    members,
    rows: members,
    byMember: Object.fromEntries(members.map((row) => [row.memberId, row])),
    provenance: withScalingProvenance(
      block.provenance,
      { memberCount: sourceRows.length },
      factor,
    ),
  };
}

function scaleMemberForceRow(row = {}, factor) {
  const quantityKeys = ['N', 'Vy', 'Vz', 'Tq', 'T', 'My', 'Mz'];
  const beforeValue = {
    endForces: cloneValue(row.endForces),
    end: cloneValue(row.end),
    ...Object.fromEntries(quantityKeys.filter((key) => row[key] != null).map((key) => [key, cloneValue(row[key])])),
    peaks: cloneValue(row.peaks),
  };
  const scaled = {
    ...row,
    endForces: scaleArray(row.endForces, factor),
    end: scaleMemberEnd(row.end, factor),
    stations: (row.stations || []).map((station) => scaleMemberStation(station, factor)),
    peaks: scaleNumericObject(row.peaks, factor),
    partialFixity: row.partialFixity
      ? {
          ...row.partialFixity,
          baseShearScalingApplied: false,
          finalDemandScaleFactor: factor,
          finalDemandScaledSeparately: true,
        }
      : null,
    provenance: withScalingProvenance(row.provenance, beforeValue, factor),
  };
  for (const key of quantityKeys) scaled[key] = scaleArray(row[key], factor);
  return scaled;
}

function scaleMemberEnd(end, factor) {
  if (!end || typeof end !== 'object') return end;
  return Object.fromEntries(Object.entries(end).map(([key, row]) => [key, scaleNumericObject(row, factor)]));
}

function scaleMemberStation(station = {}, factor) {
  const forceKeys = ['N', 'Vy', 'Vz', 'Tq', 'T', 'My', 'Mz'];
  const beforeValue = Object.fromEntries(forceKeys
    .filter((key) => station[key] != null)
    .map((key) => [key, station[key]]));
  const scaled = { ...station };
  for (const key of forceKeys) scaled[key] = scaleFinite(station[key], factor);
  scaled.provenance = withScalingProvenance(station.provenance, beforeValue, factor, Object.keys(beforeValue));
  return scaled;
}

function withScalingProvenance(provenance, beforeValue, factor, valueKeys = []) {
  const metadata = scalingMetadata(beforeValue, factor);
  return {
    ...(provenance || {}),
    scaling: {
      ...(provenance?.scaling || {}),
      applied: metadata.scaled,
      factor,
      ...metadata,
      values: Object.fromEntries(valueKeys.map((key) => [key, scalingMetadata(
        beforeValue && typeof beforeValue === 'object' ? beforeValue[key] : beforeValue,
        factor,
      )])),
    },
  };
}

function scalingMetadata(beforeValue, factor) {
  const scaleFactor = Number.isFinite(Number(factor)) && Number(factor) > 0 ? Number(factor) : 1;
  return {
    scaled: scaleFactor !== 1,
    scaleFactor,
    beforeValue: cloneValue(beforeValue),
  };
}

function scaleArray(values, factor) {
  if (!Array.isArray(values)) return values;
  return values.map((value) => scaleFinite(value, factor));
}

function scaleNumericObject(value, factor) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scaleFinite(item, factor)]));
}

function scaleFinite(value, factor) {
  const number = Number(value);
  return value != null && value !== '' && Number.isFinite(number) ? number * factor : value;
}

function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function recoverBaseShear(rsa, combined, modalRows) {
  const method = normalizedMethod(combined.method || rsa?.method);
  const candidates = [
    ['combined-base-shear', combined.baseShear, dimensionFor(combined, 'baseShear')],
    ['combined-rsa-base-shear', combined.rsaBaseShear, dimensionFor(combined, 'rsaBaseShear')],
    [`combined-${method.toLowerCase()}-base-shear`,
      combined[`${method.toLowerCase()}BaseShear`] ?? combined[method === 'NRC10' ? 'nrc10BaseShear' : method === 'ABS' ? 'absBaseShear' : method === 'CQC' ? 'cqcBaseShear' : 'srssBaseShear'],
      dimensionFor(combined, method === 'NRC10' ? 'nrc10BaseShear' : method === 'ABS' ? 'absBaseShear' : method === 'CQC' ? 'cqcBaseShear' : 'srssBaseShear')],
  ];
  for (const [source, value, dimension] of candidates) {
    if (value == null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0 && isForceDimension(dimension)) {
      return { available: true, value: Math.abs(number), source, method, reason: null };
    }
  }
  const forceRows = (modalRows || []).filter((row) => (
    row?.baseShear != null
    && row.baseShear !== ''
    && Number.isFinite(Number(row.baseShear))
    && Number(row.baseShear) >= 0
    && isForceDimension(dimensionFor(row, 'baseShear'))
  ));
  if (modalRows.length > 0 && forceRows.length === modalRows.length) {
    return {
      available: true,
      value: combineModalResponseValues(forceRows, 'baseShear', method, rsa?.spectrum?.dampingRatio ?? 0.05),
      source: 'modal-base-shear-combination',
      method,
      reason: null,
    };
  }
  return {
    available: false,
    value: null,
    source: null,
    method,
    reason: 'RSA_BASE_SHEAR_FORCE_UNAVAILABLE',
  };
}

function scaleBaseShear(baseShear, minimum, available) {
  if (!available) {
    return {
      factor: null,
      after: null,
      status: 'unsupported',
      designBlocked: true,
      reason: 'RSA_BASE_SHEAR_FORCE_UNAVAILABLE',
    };
  }
  if (!(baseShear > 0) && minimum > 0) {
    return {
      factor: null,
      after: null,
      status: 'NG',
      designBlocked: true,
      reason: 'ZERO_RSA_BASE_SHEAR_CANNOT_BE_SCALED_TO_POSITIVE_MINIMUM',
    };
  }
  const factor = baseShear > 0 && minimum > 0 ? Math.max(1, minimum / baseShear) : 1;
  const after = baseShear * factor;
  return {
    factor,
    after,
    status: minimum > 0 && after + 1e-12 < minimum ? 'NG' : 'OK',
    designBlocked: false,
    reason: null,
  };
}

function directionsFrom(rsa, minima) {
  const directions = new Set([
    ...Object.keys(rsa?.combined || {}),
    ...Object.keys(minima || {}).map((key) => String(key).toLowerCase()),
  ]);
  return [...directions].filter(Boolean).sort();
}

function dimensionFor(row, key) {
  return row?.dimensions?.[key] ?? row?.[`${key}Dimension`] ?? null;
}

function isForceDimension(value) {
  if (value == null) return true;
  if (typeof value === 'object') return String(value.kind || value.dimension || '').toLowerCase() === 'force';
  return String(value).toLowerCase() === 'force';
}

function normalizedMethod(value) {
  return normalizeModalCombinationMethod(value);
}

function nonnegativeNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}
