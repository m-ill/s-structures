import { resolveCriterion } from '../../core/analysisCriteria.js';

export const RSA_DIRECTIONAL_COMBINATION_VERSION = 'p6-m4-rsa-directional-combination-v1';

export function buildDirectionalCombinationTrace(input = {}) {
  const criteriaModel = input.criteriaModel || input.model || {};
  const dirFactor = Number(resolveCriterion(criteriaModel, 'rsa.dirFactor', input.dirFactor ?? 0.3));
  const responses = normalizeResponses(input.responses || input);
  const method = String(input.method || '100-30').toUpperCase();
  const result = combineDirectionalResponses(responses, { method, dirFactor });
  const dimension = input.dimension || 'length';
  const unit = input.unit || input.units?.response || input.units?.length || 'm';
  return {
    version: RSA_DIRECTIONAL_COMBINATION_VERSION,
    method,
    criteria: { dirFactor },
    responses,
    ...result,
    dimension,
    dimensions: {
      x: dimension,
      y: dimension,
      z: dimension,
      combined: dimension,
      dirFactor: 'dimensionless',
    },
    units: { response: unit, dirFactor: '1' },
    provenance: {
      source: input.source || 'rsa-direction-level-response',
      analysisCaseId: input.analysisCaseId || input.provenance?.analysisCaseId || null,
      responseMethod: input.responseMethod || null,
      directionalMethod: method,
      staticCaseReferences: [],
    },
    warning: result.signed ? null : 'RSA modal combination is unsigned; use signed lateral cases or ELF signs for design envelopes.',
  };
}

export function combineDirectionalResponses(responses = {}, options = {}) {
  const values = {
    x: Math.abs(Number(responses.x) || 0),
    y: Math.abs(Number(responses.y) || 0),
    z: Math.abs(Number(responses.z) || 0),
  };
  const method = String(options.method || '100-30').toUpperCase();
  if (method === 'SRSS') {
    return {
      combined: Math.hypot(values.x, values.y, values.z),
      candidates: [],
      governing: 'SRSS',
      signed: false,
    };
  }
  const factor = Number.isFinite(Number(options.dirFactor)) ? Number(options.dirFactor) : 0.3;
  const candidates = [
    candidate('X', values.x, factor * values.y, factor * values.z),
    candidate('Y', factor * values.x, values.y, factor * values.z),
    candidate('Z', factor * values.x, factor * values.y, values.z),
  ];
  const governing = candidates.reduce((best, item) => (item.value > best.value ? item : best), candidates[0]);
  return {
    combined: governing.value,
    candidates,
    governing: governing.primary,
    signed: false,
  };
}

function candidate(primary, x, y, z) {
  return { primary, x, y, z, value: Math.abs(x) + Math.abs(y) + Math.abs(z) };
}

function normalizeResponses(input = {}) {
  if (input.combined) return normalizeResponses(input.combined);
  return {
    x: Number(input.x ?? input.X ?? input.rx ?? 0) || 0,
    y: Number(input.y ?? input.Y ?? input.ry ?? 0) || 0,
    z: Number(input.z ?? input.Z ?? input.rz ?? 0) || 0,
  };
}
