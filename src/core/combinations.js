export function normalizeCombination(combo = {}, loadCases = []) {
  const factors = normalizeFactors(combo.factors, loadCases);
  const id = cleanId(combo.id) || nextCombinationId({ loadCombinations: [] });
  return {
    ...combo,
    id,
    name: String(combo.name || '').trim() || formatCombinationFactors(factors),
    type: combo.type || 'strength',
    factors,
  };
}

export function addLoadCombination(model, combo = {}) {
  model.loadCombinations ||= [];
  const normalized = normalizeCombination({
    id: combo.id || nextCombinationId(model),
    name: combo.name,
    type: combo.type,
    factors: combo.factors || defaultFactors(model),
    origin: combo.origin || 'manual',
    userModified: combo.userModified !== false,
  }, model.loadCases || []);
  model.loadCombinations.push(normalized);
  return normalized;
}

export function updateLoadCombination(model, comboId, patch = {}) {
  const combo = (model.loadCombinations || []).find((item) => item.id === comboId);
  if (!combo) return null;
  const updated = normalizeCombination({
    ...combo,
    ...patch,
    id: patch.id || combo.id,
    factors: patch.factors || combo.factors,
    origin: patch.origin || combo.origin || 'manual',
    userModified: patch.userModified !== false,
  }, model.loadCases || []);
  Object.assign(combo, updated);
  return combo;
}

export function removeLoadCombination(model, comboId) {
  const combos = model.loadCombinations || [];
  const index = combos.findIndex((item) => item.id === comboId);
  if (index < 0 || combos.length <= 1) return false;
  combos.splice(index, 1);
  return true;
}

export function nextCombinationId(model, prefix = 'CO') {
  const used = new Set((model.loadCombinations || []).map((combo) => combo.id));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export function parseCombinationFactors(text, loadCases = []) {
  const factors = {};
  const source = String(text || '').trim();
  if (!source) return normalizeFactors(factors, loadCases);
  for (const token of source.split(/[,\n;]/)) {
    const part = token.trim();
    if (!part) continue;
    const match = part.match(/^([A-Za-z0-9_.:-]+)\s*(?:=|:|\*)\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i);
    if (!match) {
      throw new Error(`Invalid factor token: ${part}`);
    }
    factors[match[1]] = Number(match[2]);
  }
  return normalizeFactors(factors, loadCases);
}

export function formatCombinationFactors(factors = {}) {
  const parts = Object.entries(factors)
    .filter(([, factor]) => Number(factor) !== 0)
    .map(([caseId, factor]) => `${formatFactor(Number(factor))}${caseId}`);
  return parts.length ? parts.join(' + ').replace(/\+ -/g, '- ') : '0';
}

export function factorText(factors = {}) {
  return Object.entries(factors)
    .map(([caseId, factor]) => `${caseId}=${formatFactor(Number(factor))}`)
    .join(', ');
}

function normalizeFactors(factors = {}, loadCases = []) {
  const out = {};
  for (const loadCase of loadCases) {
    if (loadCase?.id) out[loadCase.id] = 0;
  }
  for (const [caseId, factor] of Object.entries(factors || {})) {
    const id = cleanId(caseId);
    if (!id) continue;
    const value = Number(factor);
    if (!Number.isFinite(value)) {
      throw new Error(`Combination factor must be finite: ${id}`);
    }
    out[id] = value;
  }
  return out;
}

function defaultFactors(model) {
  const factors = {};
  for (const loadCase of model.loadCases || []) {
    if (loadCase?.id) factors[loadCase.id] = 1;
  }
  return factors;
}

function cleanId(value) {
  return String(value || '').trim();
}

function formatFactor(value) {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(6)).toString();
}
