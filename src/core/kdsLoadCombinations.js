import { formatCombinationFactors } from './combinations.js';
import { isSignedAccidentalCase, signedAccidentalSign } from './signedLateralCases.js';

export const KDS_LOAD_COMBINATION_VERSION = 'm35-kds-load-combination-presets';
export const KDS_LOAD_COMBINATION_RULE_VERSION = 'm38-kds-load-combination-rules';
export const KDS_LOAD_STANDARD_REGISTRY_VERSION = 'm44-kds-load-standard-registry';

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

export const KDS_LOAD_STANDARD_REGISTRY = {
  version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
  status: 'preliminary-scaffold',
  label: 'KDS-style load and combination registry',
  loadCaseSymbols: KDS_LOAD_CASE_TEMPLATES.map((template) => ({
    symbol: template.symbol,
    label: template.label,
    types: template.types.slice(),
    multi: !!template.multi,
    projectInputRequired: ['W', 'E', 'H', 'F', 'T', 'S', 'R'].includes(template.symbol),
  })),
  designInputs: [
    { id: 'occupancy', label: 'Occupancy and risk category', required: true },
    { id: 'importanceFactor', label: 'Importance factor', required: true },
    { id: 'windProcedure', label: 'Wind exposure, pressure, and directionality', required: true },
    { id: 'seismicProcedure', label: 'Seismic zone, site class, and response procedure', required: true },
    { id: 'snowRain', label: 'Snow and rain applicability', required: false },
    { id: 'soilFluidTemperature', label: 'Earth pressure, fluid, and temperature applicability', required: false },
    { id: 'liveLoadReduction', label: 'Live load reduction and occupancy exceptions', required: false },
  ],
  combinationPresets: KDS_LOAD_COMBINATION_PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    type: preset.type || 'strength',
    terms: { ...preset.terms },
    required: (preset.required || []).slice(),
    requiredAny: (preset.requiredAny || []).slice(),
    optional: (preset.optional || []).slice(),
    directional: preset.directional || null,
    basis: preset.basis,
  })),
  reviewChecklist: [
    'Confirm project-specific load magnitudes before relying on generated combinations.',
    'Confirm lateral sign convention and whether plus/minus load cases are modeled explicitly.',
    'Confirm serviceability limits separately from strength combinations.',
    'Confirm omitted special load symbols are truly not applicable to the project.',
  ],
};

export function getKdsLoadStandardRegistry() {
  return clonePlain(KDS_LOAD_STANDARD_REGISTRY);
}

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
  const audit = buildKdsLoadStandardAudit(loadCases, options);
  const available = {};
  const missing = [];

  for (const template of KDS_LOAD_CASE_TEMPLATES) {
    const ids = map[template.symbol] || [];
    available[template.symbol] = ids.slice();
    if (!ids.length) missing.push(template.symbol);
  }

  return {
    version: KDS_LOAD_COMBINATION_VERSION,
    standardRegistryVersion: KDS_LOAD_STANDARD_REGISTRY_VERSION,
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
      standardTrace: combo.standardTrace || null,
    })),
    audit,
    limitations: defaultKdsCombinationLimitations(),
  };
}

export function createKdsRuleBasedLoadCombinations(modelOrLoadCases = {}, options = {}) {
  const base = createKdsLoadCombinations(modelOrLoadCases, options)
    .filter((combo) => includeComboType(combo, options));
  const includeReverse = options.includeReverseLateral !== false;
  const out = [];
  const usedIds = new Set();

  for (const combo of base) {
    const lateralCases = lateralFactorCases(combo.factors);
    if (!includeReverse || !lateralCases.length) {
      out.push(withRuleTrace(combo, { sign: 'base', lateralCaseId: lateralCases[0] || null }, usedIds));
      continue;
    }

    for (const lateralCaseId of lateralCases) {
      if (isSignedAccidentalCase(lateralCaseId)) {
        out.push(withRuleTrace(combo, { sign: signedAccidentalSign(lateralCaseId), lateralCaseId, explicitSigned: true }, usedIds, 1));
        continue;
      }
      out.push(withRuleTrace(combo, { sign: 'positive', lateralCaseId }, usedIds, 1));
      out.push(withRuleTrace(combo, { sign: 'negative', lateralCaseId }, usedIds, -1));
    }
  }
  return out;
}

export function summarizeKdsLoadCombinationRules(modelOrLoadCases = {}, options = {}) {
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const coverage = summarizeKdsLoadCombinationCoverage(loadCases, options);
  const generated = createKdsRuleBasedLoadCombinations(loadCases, options);
  return {
    version: KDS_LOAD_COMBINATION_RULE_VERSION,
    presetVersion: KDS_LOAD_COMBINATION_VERSION,
    standardRegistryVersion: KDS_LOAD_STANDARD_REGISTRY_VERSION,
    status: generated.length ? 'available' : 'no-compatible-load-cases',
    generatedCount: generated.length,
    includeReverseLateral: options.includeReverseLateral !== false,
    coverage,
    generated: generated.map((combo) => ({
      id: combo.id,
      name: combo.name,
      type: combo.type,
      factors: { ...combo.factors },
      factorsText: formatCombinationFactors(combo.factors),
      ruleTrace: combo.ruleTrace,
      standardTrace: combo.standardTrace || null,
    })),
    limitations: [
      ...defaultKdsCombinationLimitations(),
      'Rule expansion creates signed wind/seismic combinations by load-case factor reversal when separate plus/minus load cases are not modeled.',
    ],
  };
}

export function buildKdsLoadStandardAudit(modelOrLoadCases = {}, options = {}) {
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const map = classifyLoadCases(loadCases);
  const generated = createKdsLoadCombinations(loadCases, options);
  const symbols = KDS_LOAD_STANDARD_REGISTRY.loadCaseSymbols.map((symbol) => {
    const caseIds = map[symbol.symbol] || [];
    return {
      symbol: symbol.symbol,
      label: symbol.label,
      status: caseIds.length ? 'mapped' : 'missing',
      caseIds,
      projectInputRequired: symbol.projectInputRequired,
    };
  });
  const presetAudit = KDS_LOAD_COMBINATION_PRESETS.map((preset) => {
    const missingRequired = missingSymbols(preset.required || [], map, { fixed: {} });
    const missingAny = preset.requiredAny?.length
      ? !preset.requiredAny.some((symbol) => (map[symbol] || []).length)
      : false;
    const generatedMatches = generated.filter((combo) => combo.sourcePreset === preset.id);
    return {
      id: preset.id,
      name: preset.name,
      type: preset.type || 'strength',
      status: missingRequired.length || missingAny ? 'blocked' : 'ready',
      required: (preset.required || []).slice(),
      requiredAny: (preset.requiredAny || []).slice(),
      optional: (preset.optional || []).slice(),
      directional: preset.directional || null,
      missingRequired,
      missingAny: missingAny ? (preset.requiredAny || []).slice() : [],
      generatedCount: generatedMatches.length,
      generatedIds: generatedMatches.map((combo) => combo.id),
    };
  });
  return {
    version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
    registryStatus: KDS_LOAD_STANDARD_REGISTRY.status,
    loadCaseCount: loadCases.length,
    mappedSymbolCount: symbols.filter((symbol) => symbol.status === 'mapped').length,
    generatedCombinationCount: generated.length,
    symbols,
    presetAudit,
    designInputs: KDS_LOAD_STANDARD_REGISTRY.designInputs.map((item) => ({ ...item })),
    reviewChecklist: KDS_LOAD_STANDARD_REGISTRY.reviewChecklist.slice(),
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

function includeComboType(combo, options) {
  if (options.includeStrength === false && combo.type === 'strength') return false;
  if (options.includeService === false && combo.type === 'service') return false;
  return true;
}

function lateralFactorCases(factors = {}) {
  return Object.entries(factors)
    .filter(([caseId, factor]) => /^[WE]/i.test(caseId) && Math.abs(Number(factor) || 0) > 0)
    .map(([caseId]) => caseId);
}

function withRuleTrace(combo, trace, usedIds, signFactor = 1) {
  const lateralCaseId = trace.lateralCaseId;
  const factors = { ...(combo.factors || {}) };
  if (lateralCaseId && signFactor < 0) factors[lateralCaseId] = -Math.abs(Number(factors[lateralCaseId]) || 0);
  if (lateralCaseId && signFactor > 0) factors[lateralCaseId] = Math.abs(Number(factors[lateralCaseId]) || 0);
  const suffix = trace.explicitSigned ? '' : trace.sign === 'positive' ? 'P' : trace.sign === 'negative' ? 'N' : '';
  const rawId = suffix ? `${combo.id}-${suffix}` : combo.id;
  const id = uniqueId(rawId, usedIds);
  usedIds.add(id);
  return {
    ...combo,
    id,
    name: formatCombinationFactors(factors),
    factors,
    generatedBy: KDS_LOAD_COMBINATION_RULE_VERSION,
    ruleTrace: {
      version: KDS_LOAD_COMBINATION_RULE_VERSION,
      presetVersion: KDS_LOAD_COMBINATION_VERSION,
      sourcePreset: combo.sourcePreset || combo.id,
      lateralCaseId,
      sign: trace.sign,
      explicitSigned: !!trace.explicitSigned,
      basis: combo.basis || null,
    },
    standardTrace: combo.standardTrace || null,
  };
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
      standardTrace: {
        version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
        sourcePreset: preset.id,
        required: (preset.required || []).slice(),
        requiredAny: (preset.requiredAny || []).slice(),
        optional: (preset.optional || []).slice(),
        directional: preset.directional || null,
        includedSymbols,
        missingSymbols: missingSymbolsForCombo,
        basis: preset.basis,
        candidate: candidate.idSuffix || null,
        reviewRequired: true,
      },
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

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
