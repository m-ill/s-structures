import { combineModalResponseValues } from '../../dynamics/modal.js';

export const RSA_BASE_SHEAR_SCALE_VERSION = 'p6-m4-rsa-base-shear-scale-v1';
export const RSA_BASE_SHEAR_SCALE_CORRECTNESS_VERSION = 'p7-m9-rsa-base-shear-scale-v1';

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

function recoverBaseShear(rsa, combined, modalRows) {
  const method = normalizedMethod(combined.method || rsa?.method);
  const candidates = [
    ['combined-base-shear', combined.baseShear, dimensionFor(combined, 'baseShear')],
    ['combined-rsa-base-shear', combined.rsaBaseShear, dimensionFor(combined, 'rsaBaseShear')],
    [method === 'CQC' ? 'combined-cqc-base-shear' : 'combined-srss-base-shear',
      method === 'CQC' ? combined.cqcBaseShear : combined.srssBaseShear,
      dimensionFor(combined, method === 'CQC' ? 'cqcBaseShear' : 'srssBaseShear')],
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
  return String(value || 'SRSS').toUpperCase() === 'CQC' ? 'CQC' : 'SRSS';
}

function nonnegativeNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return 0;
}
