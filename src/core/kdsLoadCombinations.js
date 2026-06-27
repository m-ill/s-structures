import { formatCombinationFactors } from './combinations.js';

export const KDS_LOAD_COMBINATION_VERSION = 'm35-kds-load-combination-presets';

export const KDS_LOAD_CASE_TEMPLATES = [
  { symbol: 'D', label: 'Dead load', types: ['dead'] },
  { symbol: 'L', label: 'Live load', types: ['live'] },
  { symbol: 'Lr', label: 'Roof live load', types: ['roofLive', 'roof-live', 'roof_live'] },
  { symbol: 'S', label: 'Snow load', types: ['snow'] },
  { symbol: 'R', label: 'Rain load', types: ['rain'] },
  { symbol: 'W', label: 'Wind load', types: ['wind'], multi: true },
  { symbol: 'E', label: 'Seismic load', types: ['seismic', 'earthquake'], multi: true },
  { symbol: 'H', label: 'Earth pressure load', types: ['earthPressure', 'earth-pressure'] },
  { symbol: 'F', label: 'Fluid load', types: ['fluid'] },
  { symbol: 'T', label: 'Temperature load', types: ['temperature'] },
];

export const KDS_LOAD_COMBINATION_PRESETS = [
  {
    id: 'KDS-ST-01',
    name: '1.4D',
    type: 'strength',
    terms: { D: 1.4 },
    required: ['D'],
    basis: 'Common KDS-style strength pattern for gravity-only dead load.',
  },
  {
    id: 'KDS-ST-02',
    name: '1.2D + 1.6L',
    type: 'strength',
    terms: { D: 1.2, L: 1.6 },
    required: ['D', 'L'],
    basis: 'Common KDS-style strength pattern for dead plus live load.',
  },
  {
    id: 'KDS-ST-03',
    name: '1.2D + 1.6(Lr/S/R) + 0.5L',
    type: 'strength',
    terms: { D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, L: 0.5 },
    requiredAny: ['Lr', 'S', 'R'],
    optional: ['L'],
    basis: 'Common KDS-style strength pattern for roof, snow, or rain load.',
  },
  {
    id: 'KDS-ST-04',
    name: '1.2D + 1.0W + 1.0L',
    type: 'strength',
    terms: { D: 1.2, W: 1.0, L: 1.0 },
    required: ['D', 'W'],
    optional: ['L'],
    directional: 'W',
    basis: 'Common KDS-style strength pattern including wind load.',
  },
  {
    id: 'KDS-ST-05',
    name: '1.2D + 1.0E + 1.0L',
    type: 'strength',
    terms: { D: 1.2, E: 1.0, L: 1.0 },
    required: ['D', 'E'],
    optional: ['L'],
    directional: 'E',
    basis: 'Common KDS-style strength pattern including seismic load.',
  },
  {
    id: 'KDS-ST-06',
    name: '0.9D + 1.0W',
    type: 'strength',
    terms: { D: 0.9, W: 1.0 },
    required: ['D', 'W'],
    directional: 'W',
    basis: 'Common KDS-style uplift/overturning strength pattern including wind load.',
  },
  {
    id: 'KDS-ST-07',
    name: '0.9D + 1.0E',
    type: 'strength',
    terms: { D: 0.9, E: 1.0 },
    required: ['D', 'E'],
    directional: 'E',
    basis: 'Common KDS-style uplift/overturning strength pattern including seismic load.',
  },
  {
    id: 'KDS-SVC-01',
    name: '1.0D',
    type: 'service',
    terms: { D: 1.0 },
    required: ['D'],
    basis: 'Service load pattern for dead load.',
  },
  {
    id: 'KDS-SVC-02',
    name: '1.0D + 1.0L',
    type: 'service',
    terms: { D: 1.0, L: 1.0 },
    required: ['D', 'L'],
    basis: 'Service load pattern for gravity deflection review.',
  },
  {
    id: 'KDS-SVC-03',
    name: '1.0D + 0.5L + 1.0W',
    type: 'service',
    terms: { D: 1.0, L: 0.5, W: 1.0 },
    required: ['D', 'W'],
    optional: ['L'],
    directional: 'W',
    basis: 'Service load pattern for wind drift review.',
  },
  {
    id: 'KDS-SVC-04',
    name: '1.0D + 0.5L + 1.0E',
    type: 'service',
    terms: { D: 1.0, L: 0.5, E: 1.0 },
    required: ['D', 'E'],
    optional: ['L'],
    directional: 'E',
    basis: 'Service load pattern for seismic drift review.',
  },
];

export function createKdsLoadCombinations(modelOrLoadCases = {}, options = {}) {
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const map = classifyLoadCases(loadCases);
  const out = [];
  const usedIds = new Set();

  for (const preset of KDS_LOAD_COMBINATION_PRESETS) {
    for (const combo of expandPreset(preset, loadCases, map, options)) {
      combo.id = uniqueId(combo.id, usedIds);
      usedIds.add(combo.id);
      out.push(combo);
    }
  }
  return out;
}

export function summarizeKdsLoadCombinationCoverage(modelOrLoadCases = {}, options = {}) {
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const map = classifyLoadCases(loadCases);
  const generated = createKdsLoadCombinations(loadCases, options);
  const available = {};
  const missing = [];

  for (const template of KDS_LOAD_CASE_TEMPLATES) {
    const ids = map[template.symbol] || [];
    available[template.symbol] = ids.slice();
    if (!ids.length) missing.push(template.symbol);
  }

  return {
    version: KDS_LOAD_COMBINATION_VERSION,
    status: generated.length ? 'available' : 'no-compatible-load-cases',
    loadCaseCount: loadCases.length,
    generatedCount: generated.length,
    available,
    missing,
    generated: generated.map((combo) => ({
      id: combo.id,
      name: combo.name,
      type: combo.type,
      factors: { ...combo.factors },
      factorsText: formatCombinationFactors(combo.factors),
      basis: combo.basis,
      sourcePreset: combo.sourcePreset,
    })),
    limitations: defaultKdsCombinationLimitations(),
  };
}

export function defaultKdsCombinationLimitations() {
  return [
    'The preset list is a KDS-style project scaffold, not a complete legal code implementation.',
    'Occupancy, importance, seismic/wind procedure, live load reduction, snow/rain exceptions, and special load effects must be supplied by the project design basis.',
    'Generated factors should be reviewed before sealing or issuing a structural calculation package.',
  ];
}

function expandPreset(preset, loadCases, map, options) {
  const candidates = presetCandidates(preset, map);
  const out = [];
  for (const candidate of candidates) {
    const missingRequired = missingSymbols(preset.required || [], map, candidate);
    const missingAny = preset.requiredAny?.length
      ? !preset.requiredAny.some((symbol) => resolveSymbol(symbol, map, candidate).length)
      : false;
    if ((missingRequired.length || missingAny) && !options.includeMissing) continue;

    const factors = emptyFactors(loadCases);
    const includedSymbols = [];
    const missingSymbolsForCombo = [];
    for (const [symbol, factor] of Object.entries(preset.terms || {})) {
      const caseIds = resolveSymbol(symbol, map, candidate);
      if (!caseIds.length) {
        if (!preset.optional?.includes(symbol) && !preset.requiredAny?.includes(symbol)) missingSymbolsForCombo.push(symbol);
        continue;
      }
      for (const caseId of caseIds) {
        factors[caseId] = Number(factor) || 0;
      }
      includedSymbols.push(symbol);
    }

    if (!Object.values(factors).some((factor) => Math.abs(factor) > 0)) continue;
    out.push({
      id: candidate.idSuffix ? `${preset.id}-${candidate.idSuffix}` : preset.id,
      name: nameForCombo(preset, factors),
      type: preset.type || 'strength',
      factors,
      basis: preset.basis,
      sourcePreset: preset.id,
      generatedBy: KDS_LOAD_COMBINATION_VERSION,
      includedSymbols,
      missingSymbols: missingSymbolsForCombo,
      codeReference: 'KDS-style load combination preset',
    });
  }
  return out;
}

function presetCandidates(preset, map) {
  let candidates = directionalCandidates(preset, map);
  if (!preset.requiredAny?.length) return candidates;

  const alternativeSymbols = preset.requiredAny.filter((symbol) => (map[symbol] || []).length);
  if (!alternativeSymbols.length) return candidates;

  const expanded = [];
  for (const candidate of candidates) {
    for (const symbol of alternativeSymbols) {
      for (const caseId of map[symbol] || []) {
        const fixed = { ...(candidate.fixed || {}) };
        for (const other of preset.requiredAny) fixed[other] = [];
        fixed[symbol] = [caseId];
        expanded.push({
          fixed,
          idSuffix: [candidate.idSuffix, caseId].filter(Boolean).join('-'),
        });
      }
    }
  }
  return expanded;
}

function directionalCandidates(preset, map) {
  const symbol = preset.directional;
  if (!symbol) return [{ fixed: {}, idSuffix: '' }];
  const ids = map[symbol] || [];
  if (!ids.length) return [{ fixed: {}, idSuffix: symbol }];
  return ids.map((id) => ({ fixed: { [symbol]: [id] }, idSuffix: id }));
}

function missingSymbols(symbols, map, candidate) {
  return symbols.filter((symbol) => !resolveSymbol(symbol, map, candidate).length);
}

function resolveSymbol(symbol, map, candidate) {
  if (candidate?.fixed && Object.prototype.hasOwnProperty.call(candidate.fixed, symbol)) {
    return candidate.fixed[symbol] || [];
  }
  return map[symbol] || [];
}

function nameForCombo(preset, factors) {
  return formatCombinationFactors(factors) || preset.name || preset.id;
}

function emptyFactors(loadCases) {
  const factors = {};
  for (const loadCase of loadCases) factors[loadCase.id] = 0;
  return factors;
}

function normalizeLoadCases(modelOrLoadCases) {
  const loadCases = Array.isArray(modelOrLoadCases)
    ? modelOrLoadCases
    : modelOrLoadCases?.loadCases || [];
  return loadCases
    .filter((loadCase) => loadCase?.id)
    .map((loadCase) => ({
      id: String(loadCase.id),
      name: String(loadCase.name || loadCase.id),
      type: String(loadCase.type || '').trim(),
    }));
}

function classifyLoadCases(loadCases) {
  const map = Object.fromEntries(KDS_LOAD_CASE_TEMPLATES.map((template) => [template.symbol, []]));
  for (const loadCase of loadCases) {
    const id = loadCase.id;
    const type = loadCase.type;
    for (const template of KDS_LOAD_CASE_TEMPLATES) {
      if (matchesTemplate(id, type, template)) map[template.symbol].push(id);
    }
  }
  return map;
}

function matchesTemplate(id, type, template) {
  if (id === template.symbol) return true;
  const normalizedId = id.toUpperCase();
  const normalizedSymbol = template.symbol.toUpperCase();
  if (template.multi && normalizedId.startsWith(normalizedSymbol)) return true;
  return template.types.some((item) => item.toLowerCase() === type.toLowerCase());
}

function uniqueId(baseId, usedIds) {
  let id = baseId;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  return id;
}
