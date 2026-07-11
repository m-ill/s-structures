import { resolveCriterion } from '../../core/analysisCriteria.js';

export const RSA_MASS_PARTICIPATION_VERSION = 'p6-m4-rsa-mass-participation-v1';

export function buildMassParticipationTrace(dynamics = {}, criteriaModel = {}) {
  const massMin = Number(resolveCriterion(criteriaModel, 'rsa.massMin', 0.9));
  const massStrong = Number(resolveCriterion(criteriaModel, 'rsa.massStrong', 0.8));
  const directions = Object.keys(dynamics?.rsa?.combined || {}).length
    ? Object.keys(dynamics.rsa.combined)
    : ['x', 'y', 'z'];
  const cumulative = Object.fromEntries(directions.map((direction) => [direction, 0]));
  const rows = [];

  for (const mode of dynamics?.modes || []) {
    for (const direction of directions) {
      const item = mode.participation?.[direction] || {};
      const massRatio = finite(item.massRatio);
      const directionIndex = ['x', 'y', 'z'].indexOf(direction);
      cumulative[direction] += massRatio;
      rows.push({
        modeId: mode.id,
        modeIndex: mode.index,
        direction,
        period: finite(mode.period, null),
        frequencyHz: finite(mode.frequencyHz, null),
        gamma: finite(item.gamma, 0),
        modalMass: finite(item.modalMass, 0),
        generalizedMass: finite(item.generalizedMass ?? item.modalMass, 0),
        effectiveModalMass: finite(
          item.effectiveModalMass ?? item.effectiveMass,
          massRatio * finite(dynamics?.mass?.total?.[directionIndex], 0),
        ),
        effectiveMassRatio: massRatio,
        cumulativeMassRatio: Math.min(1, cumulative[direction]),
        normalization: mode.normalization?.analysis || 'unknown',
        dimensions: {
          period: 'time',
          frequency: 'inverse-time',
          gamma: 'square-root-mass',
          generalizedMass: 'dimensionless',
          effectiveModalMass: 'mass',
          effectiveMassRatio: 'dimensionless',
          cumulativeMassRatio: 'dimensionless',
        },
        provenance: {
          source: 'mass-normalized-modal-participation',
          modeId: mode.id,
          direction,
          staticCaseReferences: [],
        },
      });
    }
  }

  const directionsSummary = directions.map((direction) => {
    const ratio = Math.min(1, cumulative[direction]);
    const residualMassRatio = Math.max(0, 1 - ratio);
    return {
      direction,
      cumulativeMassRatio: ratio,
      residualMassRatio,
      status: participationStatus(ratio, massMin, massStrong),
      warning: participationWarning(direction, ratio, massMin, massStrong),
    };
  });

  return {
    version: RSA_MASS_PARTICIPATION_VERSION,
    criteria: { massMin, massStrong },
    dimensions: {
      period: 'time',
      frequency: 'inverse-time',
      effectiveModalMass: 'mass',
      massRatio: 'dimensionless',
    },
    units: {
      period: 's',
      frequency: 'Hz',
      mass: dynamics?.units?.mass || 't',
      massRatio: '1',
    },
    provenance: {
      source: 'analysis.dynamics.modes.participation',
      modalNormalization: 'mass-normalized',
      staticCaseReferences: [],
    },
    rowCount: rows.length,
    modeCount: dynamics?.modes?.length || 0,
    rows,
    directions: directionsSummary,
    warnings: directionsSummary.map((row) => row.warning).filter(Boolean),
    status: worstStatus(directionsSummary.map((row) => row.status)),
  };
}

function participationStatus(ratio, massMin, massStrong) {
  if (ratio < massStrong) return 'STRONG_WARNING';
  if (ratio < massMin) return 'WARNING';
  return 'OK';
}

function participationWarning(direction, ratio, massMin, massStrong) {
  if (ratio < massStrong) return `${direction.toUpperCase()} modal participation below strong threshold ${massStrong}.`;
  if (ratio < massMin) return `${direction.toUpperCase()} modal participation below target ${massMin}.`;
  return null;
}

function worstStatus(statuses) {
  if (statuses.includes('STRONG_WARNING')) return 'STRONG_WARNING';
  if (statuses.includes('WARNING')) return 'WARNING';
  if (statuses.includes('OK')) return 'OK';
  return 'NA';
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
