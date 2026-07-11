import { formatCombinationFactors } from './combinations.js';
import { isSignedAccidentalCase, signedAccidentalSign } from './signedLateralCases.js';
import {
  inferLoadCaseFamily,
  normalizeLoadCaseMetadata,
} from '../loads/loadCaseMetadata.js';

export const KDS_LOAD_COMBINATION_VERSION = 'm35-kds-load-combination-presets';
export const KDS_LOAD_COMBINATION_RULE_VERSION = 'm38-kds-load-combination-rules';
export const KDS_LOAD_STANDARD_REGISTRY_VERSION = 'm44-kds-load-standard-registry';
export const LOAD_RULE_PACK_CONTRACT_VERSION = 'p7-m5-load-rule-pack-v1';
export const KDS_CANDIDATE_RULE_PACK_ID = 'KDS-STYLE-CANDIDATE@M44';
export const KDS_41_12_00_2022_RULE_PACK_ID = 'KDS-41-12-00:2022@MOLIT-2024-846';

export const LOAD_RULE_PUBLICATION_STATUSES = Object.freeze([
  'effective',
  'adopted-not-effective',
  'draft',
  'withdrawn',
]);

export const KDS_LOAD_CASE_TEMPLATES = [
  { symbol: 'D', family: 'D', label: 'Dead load', types: ['dead'], variants: ['self-weight', 'superimposed'] },
  { symbol: 'L', family: 'L', label: 'Live load', types: ['live'], variants: ['occupancy', 'pattern'] },
  { symbol: 'Lr', family: 'Lr', label: 'Roof live load', types: ['roof', 'roofLive', 'roof-live', 'roof_live'], variants: ['roof'] },
  { symbol: 'S', family: 'S', label: 'Snow load', types: ['snow'] },
  { symbol: 'R', family: 'R', label: 'Rain load', types: ['rain'] },
  { symbol: 'W', family: 'W', label: 'Wind load', types: ['wind'], multi: true, directional: true },
  { symbol: 'E', family: 'E', label: 'Seismic load', types: ['seismic', 'earthquake'], multi: true, directional: true },
  { symbol: 'H', family: 'H', label: 'Earth pressure load', types: ['earthPressure', 'earth-pressure'] },
  { symbol: 'F', family: 'F', label: 'Fluid load', types: ['fluid'] },
  { symbol: 'T', family: 'T', label: 'Temperature load', types: ['temperature'] },
  { symbol: 'EQUIPMENT', family: 'EQUIPMENT', label: 'Equipment load', types: ['equipment'] },
  { symbol: 'CONSTRUCTION', family: 'CONSTRUCTION', label: 'Construction load', types: ['construction'] },
  { symbol: 'OTHER', family: 'OTHER', label: 'Other load', types: ['other', 'user'], automatic: false },
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
].map(withCandidatePresetMetadata);

export const KDS_LOAD_RULE_PACK = Object.freeze({
  contractVersion: LOAD_RULE_PACK_CONTRACT_VERSION,
  id: KDS_CANDIDATE_RULE_PACK_ID,
  authority: null,
  code: 'KDS-style load combination scaffold',
  edition: null,
  amendmentsReviewed: Object.freeze([]),
  publicationStatus: 'draft',
  effectiveDate: null,
  verifiedAt: null,
  sourceUrls: Object.freeze([]),
  sourceHash: null,
  status: 'candidate',
  verificationStatus: 'candidate',
  methods: Object.freeze(['strength', 'service']),
  purposes: Object.freeze(['strength', 'service', 'deflection', 'drift', 'p-delta', 'foundation', 'uplift']),
  automationStatus: 'comparison-only',
  factorEvidence: 'candidate-existing-presets-without-attached-official-fixtures',
  rules: Object.freeze(KDS_LOAD_COMBINATION_PRESETS.map((preset) => Object.freeze(clonePlain(preset)))),
});

const KDS_41_12_00_2022_RULES = [
  rule('KDS22-ST-01', '1.4(D + F)', 'strength', 'strength',
    { D: 1.4, F: 1.4 }, ['D'], ['F']),
  rule('KDS22-ST-02', '1.2(D + F + T) + 1.6L + 0.5(Lr/S/R)', 'strength', 'strength',
    { D: 1.2, F: 1.2, T: 1.2, L: 1.6, Lr: 0.5, S: 0.5, R: 0.5 }, ['D', 'L'], ['F', 'T'], [
      alternativeGroup('roof', ['Lr', 'S', 'R'], false),
    ]),
  rule('KDS22-ST-03', '1.2D + 1.6(Lr/S/R) + (1.0L or 0.5W)', 'strength', 'strength',
    { D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, L: 1.0, W: 0.5 }, ['D'], [], [
      alternativeGroup('roof', ['Lr', 'S', 'R'], true),
      alternativeGroup('companion', ['L', 'W'], true),
    ], 'W'),
  rule('KDS22-ST-04', '1.2D + 1.0W + 1.0L + 0.5(Lr/S/R)', 'strength', 'strength',
    { D: 1.2, W: 1.0, L: 1.0, Lr: 0.5, S: 0.5, R: 0.5 }, ['D', 'W'], ['L'], [
      alternativeGroup('roof', ['Lr', 'S', 'R'], false),
    ], 'W'),
  rule('KDS22-ST-05', '1.2D + 1.0E + 1.0L + 0.2S', 'strength', 'strength',
    { D: 1.2, E: 1.0, L: 1.0, S: 0.2 }, ['D', 'E'], ['L', 'S'], [], 'E'),
  rule('KDS22-ST-06', '0.9D + 1.0W', 'strength', 'strength',
    { D: 0.9, W: 1.0 }, ['D', 'W'], [], [], 'W', ['strength', 'foundation', 'uplift']),
  rule('KDS22-ST-07', '0.9D + 1.0E', 'strength', 'strength',
    { D: 0.9, E: 1.0 }, ['D', 'E'], [], [], 'E', ['strength', 'foundation', 'uplift']),
  rule('KDS22-ASD-01', 'D + F', 'service', 'allowable',
    { D: 1.0, F: 1.0 }, ['D'], ['F']),
  rule('KDS22-ASD-02', 'D + F + L + T', 'service', 'allowable',
    { D: 1.0, F: 1.0, L: 1.0, T: 1.0 }, ['D', 'L'], ['F', 'T']),
  rule('KDS22-ASD-03', 'D + F + (Lr/S/R)', 'service', 'allowable',
    { D: 1.0, F: 1.0, Lr: 1.0, S: 1.0, R: 1.0 }, ['D'], ['F'], [
      alternativeGroup('roof', ['Lr', 'S', 'R'], true),
    ]),
  rule('KDS22-ASD-04', 'D + F + 0.75(L + T) + 0.75(Lr/S/R)', 'service', 'allowable',
    { D: 1.0, F: 1.0, L: 0.75, T: 0.75, Lr: 0.75, S: 0.75, R: 0.75 }, ['D'], ['F', 'L', 'T'], [
      alternativeGroup('roof', ['Lr', 'S', 'R'], true),
    ]),
  rule('KDS22-ASD-05', 'D + F + (0.65W or 0.7E)', 'service', 'allowable',
    { D: 1.0, F: 1.0, W: 0.65, E: 0.7 }, ['D'], ['F'], [
      alternativeGroup('lateral', ['W', 'E'], true),
    ]),
  rule('KDS22-ASD-06', 'D + F + 0.75(0.65W or 0.7E) + 0.75L + 0.75(Lr/S/R)', 'service', 'allowable',
    { D: 1.0, F: 1.0, W: 0.4875, E: 0.525, L: 0.75, Lr: 0.75, S: 0.75, R: 0.75 }, ['D'], ['F', 'L'], [
      alternativeGroup('lateral', ['W', 'E'], true),
      alternativeGroup('roof', ['Lr', 'S', 'R'], false),
    ]),
  rule('KDS22-ASD-07', '0.6D + 0.65W', 'service', 'allowable',
    { D: 0.6, W: 0.65 }, ['D', 'W'], [], [], 'W', ['service', 'foundation', 'uplift']),
  rule('KDS22-ASD-08', '0.6D + 0.7E', 'service', 'allowable',
    { D: 0.6, E: 0.7 }, ['D', 'E'], [], [], 'E', ['service', 'foundation', 'uplift']),
];

export const KDS_41_12_00_2022_RULE_PACK = Object.freeze({
  contractVersion: LOAD_RULE_PACK_CONTRACT_VERSION,
  id: KDS_41_12_00_2022_RULE_PACK_ID,
  authority: 'Ministry of Land, Infrastructure and Transport, Republic of Korea',
  code: 'KDS 41 12 00',
  edition: '2022',
  editionDate: '2022-10-11',
  amendmentsReviewed: Object.freeze(['MOLIT Notice 2024-846']),
  notice: 'MOLIT Notice 2024-846',
  noticeDate: '2024-12-24',
  publicationStatus: 'effective',
  effectiveDate: '2024-12-24',
  verifiedAt: null,
  sourceUrls: Object.freeze([
    'https://www.standard.go.kr/KSCI/technologyIntro/getTechnologyDetailView.do?trgId=0000000026&trgReformNo=0006',
    'https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?gubun=&idx=18415',
  ]),
  sourceHash: null,
  status: 'candidate',
  verificationStatus: 'source-attached',
  evidenceStatus: 'source-attached',
  sourceAttachmentStatus: 'source-attached',
  methods: Object.freeze(['strength', 'allowable']),
  purposes: Object.freeze(['strength', 'service', 'deflection', 'drift', 'p-delta', 'foundation', 'uplift']),
  automationStatus: 'comparison-only',
  factorEvidence: 'official-page-and-notice-attached-no-downloaded-source-file-hash',
  rules: Object.freeze(KDS_41_12_00_2022_RULES.map((item) => Object.freeze(clonePlain(item)))),
});

export const KDS_LOAD_STANDARD_REGISTRY = {
  version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
  status: 'preliminary-scaffold',
  evidenceStatus: 'candidate',
  publicationStatus: KDS_LOAD_RULE_PACK.publicationStatus,
  label: 'KDS-style load and combination registry',
  rulePack: rulePackMetadata(KDS_LOAD_RULE_PACK),
  loadCaseSymbols: KDS_LOAD_CASE_TEMPLATES.map((template) => ({
    symbol: template.symbol,
    family: template.family || template.symbol,
    label: template.label,
    types: template.types.slice(),
    multi: !!template.multi,
    directional: !!template.directional,
    variants: (template.variants || []).slice(),
    automatic: template.automatic !== false,
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
    method: preset.method,
    purposes: preset.purposes.slice(),
    status: preset.status,
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

export function getKdsLoadRulePack() {
  return clonePlain(KDS_LOAD_RULE_PACK);
}

export function createLoadCombinationsFromRulePack(modelOrLoadCases = {}, rulePackInput = {}, options = {}) {
  const rulePack = normalizeRulePack(rulePackInput);
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const map = classifyLoadCases(loadCases);
  const method = options.method ? String(options.method).trim().toLowerCase() : null;
  const purpose = options.purpose ? String(options.purpose).trim().toLowerCase() : null;
  const base = [];
  const usedBaseIds = new Set();

  for (const preset of rulePack.rules) {
    if (method && preset.method !== method) continue;
    if (purpose && !preset.purposes.includes(purpose)) continue;
    for (const combo of expandPreset(preset, loadCases, map, options, { rulePack })) {
      combo.id = uniqueId(combo.id, usedBaseIds);
      usedBaseIds.add(combo.id);
      base.push(combo);
    }
  }

  if (options.includeReverseLateral === false) return base.map(compactCombinationFactors);
  const out = [];
  const usedIds = new Set();
  for (const combo of base) {
    const lateralCases = lateralFactorCases(combo.factors);
    if (!lateralCases.length) {
      out.push(withRuleTrace(combo, { sign: 'base', lateralCaseId: null }, usedIds, 1, { rulePack }));
      continue;
    }
    for (const lateralCaseId of lateralCases) {
      if (isSignedAccidentalCase(lateralCaseId)) {
        out.push(withRuleTrace(combo, {
          sign: signedAccidentalSign(lateralCaseId),
          lateralCaseId,
          explicitSigned: true,
        }, usedIds, 1, { rulePack }));
        continue;
      }
      out.push(withRuleTrace(combo, { sign: 'positive', lateralCaseId }, usedIds, 1, { rulePack }));
      out.push(withRuleTrace(combo, { sign: 'negative', lateralCaseId }, usedIds, -1, { rulePack }));
    }
  }
  return out.map(compactCombinationFactors);
}

export function createKdsLoadCombinations(modelOrLoadCases = {}, options = {}) {
  const loadCases = normalizeLoadCases(modelOrLoadCases);
  const map = classifyLoadCases(loadCases);
  const out = [];
  const usedIds = new Set();

  for (const preset of KDS_LOAD_COMBINATION_PRESETS) {
    for (const combo of expandPreset(preset, loadCases, map, options, { rulePack: KDS_LOAD_RULE_PACK })) {
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
    evidenceStatus: KDS_LOAD_RULE_PACK.status,
    rulePack: rulePackMetadata(KDS_LOAD_RULE_PACK),
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
      generatedKey: combo.generatedKey || null,
      method: combo.method || null,
      purposes: (combo.purposes || []).slice(),
      status: combo.status || 'candidate',
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
    evidenceStatus: KDS_LOAD_RULE_PACK.status,
    rulePack: rulePackMetadata(KDS_LOAD_RULE_PACK),
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
      generatedKey: combo.generatedKey || null,
      method: combo.method || null,
      purposes: (combo.purposes || []).slice(),
      status: combo.status || 'candidate',
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
      method: preset.method,
      purposes: preset.purposes.slice(),
      evidenceStatus: preset.status,
    };
  });
  return {
    version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
    registryStatus: KDS_LOAD_STANDARD_REGISTRY.status,
    evidenceStatus: KDS_LOAD_RULE_PACK.status,
    publicationStatus: KDS_LOAD_RULE_PACK.publicationStatus,
    rulePack: rulePackMetadata(KDS_LOAD_RULE_PACK),
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
    'The existing factors are retained as candidate values because official factor fixtures and independent review evidence are not attached.',
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
    .filter(([caseId, factor]) => /^(?:W|E)(?:$|[XYZ+\-_:])/i.test(caseId) && Math.abs(Number(factor) || 0) > 0)
    .map(([caseId]) => caseId);
}

function withRuleTrace(combo, trace, usedIds, signFactor = 1, context = {}) {
  const rulePack = normalizeRulePack(context.rulePack || KDS_LOAD_RULE_PACK);
  const legacyCandidate = rulePack.id === KDS_CANDIDATE_RULE_PACK_ID;
  const ruleVersion = legacyCandidate ? KDS_LOAD_COMBINATION_RULE_VERSION : LOAD_RULE_PACK_CONTRACT_VERSION;
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
    generatedBy: legacyCandidate ? KDS_LOAD_COMBINATION_RULE_VERSION : rulePack.id,
    sourceId: rulePack.id,
    generatedKey: combinationGeneratedKey({
      sourceId: rulePack.id,
      sourcePreset: combo.sourcePreset || combo.id,
      factors,
      method: combo.method,
      purposes: combo.purposes,
    }),
    ruleTrace: {
      version: ruleVersion,
      presetVersion: legacyCandidate ? KDS_LOAD_COMBINATION_VERSION : rulePack.id,
      rulePack: rulePackMetadata(rulePack),
      sourcePreset: combo.sourcePreset || combo.id,
      lateralCaseId,
      sign: trace.sign,
      explicitSigned: !!trace.explicitSigned,
      basis: combo.basis || null,
    },
    standardTrace: combo.standardTrace || null,
  };
}

function expandPreset(preset, loadCases, map, options, context = {}) {
  const rulePack = normalizeRulePack(context.rulePack || KDS_LOAD_RULE_PACK);
  const legacyCandidate = rulePack.id === KDS_CANDIDATE_RULE_PACK_ID;
  const candidates = presetCandidates(preset, map);
  const out = [];
  for (const candidate of candidates) {
    const missingRequired = missingSymbols(preset.required || [], map, candidate);
    const missingAlternativeGroups = requiredAlternativeGroups(preset)
      .filter((group) => !group.symbols.some((symbol) => resolveSymbol(symbol, map, candidate).length));
    if ((missingRequired.length || missingAlternativeGroups.length) && !options.includeMissing) continue;

    const factors = emptyFactors(loadCases);
    const includedSymbols = [];
    const missingSymbolsForCombo = [];
    const alternativeSymbols = new Set(presetAlternativeGroups(preset).flatMap((group) => group.symbols));
    for (const [symbol, factor] of Object.entries(preset.terms || {})) {
      const caseIds = resolveSymbol(symbol, map, candidate);
      if (!caseIds.length) {
        if (!preset.optional?.includes(symbol) && !alternativeSymbols.has(symbol)) missingSymbolsForCombo.push(symbol);
        continue;
      }
      for (const caseId of caseIds) {
        factors[caseId] = Number(factor) || 0;
      }
      includedSymbols.push(symbol);
    }

    if (!Object.values(factors).some((factor) => Math.abs(factor) > 0)) continue;
    const comboFactors = { ...factors };
    out.push({
      id: candidate.idSuffix ? `${preset.id}-${candidate.idSuffix}` : preset.id,
      name: nameForCombo(preset, factors),
      type: preset.type || 'strength',
      factors: comboFactors,
      basis: preset.basis,
      sourcePreset: preset.id,
      generatedBy: legacyCandidate ? KDS_LOAD_COMBINATION_VERSION : rulePack.id,
      origin: 'rule-pack',
      sourceId: rulePack.id,
      generatedKey: combinationGeneratedKey({
        sourceId: rulePack.id,
        sourcePreset: preset.id,
        factors: comboFactors,
        method: preset.method,
        purposes: preset.purposes,
      }),
      userModified: false,
      status: rulePack.status,
      method: preset.method,
      purposes: preset.purposes.slice(),
      purpose: preset.purposes[0] || null,
      rulePack: rulePackMetadata(rulePack),
      includedSymbols,
      missingSymbols: missingSymbolsForCombo,
      codeReference: rulePack.code || 'KDS-style load combination preset',
      standardTrace: {
        version: KDS_LOAD_STANDARD_REGISTRY_VERSION,
        rulePackVersion: rulePack.id,
        publicationStatus: rulePack.publicationStatus,
        evidenceStatus: rulePack.status,
        sourcePreset: preset.id,
        required: (preset.required || []).slice(),
        requiredAny: (preset.requiredAny || []).slice(),
        alternativeGroups: clonePlain(presetAlternativeGroups(preset)),
        optional: (preset.optional || []).slice(),
        directional: preset.directional || null,
        includedSymbols,
        missingSymbols: missingSymbolsForCombo,
        basis: preset.basis,
        candidate: candidate.idSuffix || null,
        reviewRequired: rulePack.status !== 'verified' || missingSymbolsForCombo.length > 0,
      },
    });
  }
  return out;
}

function presetCandidates(preset, map) {
  const groups = presetAlternativeGroups(preset);
  let candidates = [{ fixed: {}, suffixParts: [] }];

  for (const group of groups) {
    const choices = group.symbols.flatMap((symbol) => (map[symbol] || []).map((caseId) => ({ symbol, caseId })));
    const applicableChoices = choices.length ? choices : [null];
    const expanded = [];
    for (const candidate of candidates) {
      for (const choice of applicableChoices) {
        const fixed = { ...candidate.fixed };
        for (const symbol of group.symbols) fixed[symbol] = [];
        if (choice) fixed[choice.symbol] = [choice.caseId];
        expanded.push({
          fixed,
          suffixParts: choice
            ? [...candidate.suffixParts, choice.caseId]
            : group.required
              ? [...candidate.suffixParts, group.id]
              : candidate.suffixParts.slice(),
        });
      }
    }
    candidates = expanded;
  }

  const groupedSymbols = new Set(groups.flatMap((group) => group.symbols));
  const directional = preset.directional;
  if (directional && !groupedSymbols.has(directional)) {
    const ids = map[directional] || [];
    const applicableIds = ids.length ? ids : [null];
    candidates = candidates.flatMap((candidate) => applicableIds.map((caseId) => ({
      fixed: { ...candidate.fixed, [directional]: caseId ? [caseId] : [] },
      suffixParts: [...candidate.suffixParts, caseId || directional],
    })));
  }

  return candidates.map((candidate) => ({
    fixed: candidate.fixed,
    idSuffix: candidate.suffixParts.filter(Boolean).join('-'),
  }));
}

function presetAlternativeGroups(preset = {}) {
  if (preset.alternativeGroups?.length) return preset.alternativeGroups;
  if (preset.requiredAny?.length) return [alternativeGroup('required-any', preset.requiredAny, true)];
  return [];
}

function requiredAlternativeGroups(preset) {
  return presetAlternativeGroups(preset).filter((group) => group.required !== false);
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
    .map((loadCase) => {
      const normalized = normalizeLoadCaseMetadata(loadCase);
      return {
        id: String(loadCase.id),
        name: String(loadCase.name || loadCase.id),
        type: String(loadCase.type || '').trim(),
        family: normalized.family,
        familyExplicit: !!loadCase.family,
        direction: normalized.direction,
        sign: normalized.sign,
        variant: normalized.variant,
      };
    });
}

function classifyLoadCases(loadCases) {
  const map = Object.fromEntries(KDS_LOAD_CASE_TEMPLATES.map((template) => [template.symbol, []]));
  for (const loadCase of loadCases) {
    for (const template of KDS_LOAD_CASE_TEMPLATES) {
      if (matchesTemplate(loadCase, template)) map[template.symbol].push(loadCase.id);
    }
  }
  return map;
}

function matchesTemplate(loadCase, template) {
  const { family, familyExplicit } = loadCase;
  if (template.automatic === false) return family === template.family && familyExplicit;
  return family === template.family;
}

function withCandidatePresetMetadata(preset) {
  const rawType = String(preset.type || '').trim().toLowerCase();
  const method = String(preset.method || rawType || 'strength').trim().toLowerCase();
  const type = ['strength', 'service', 'envelope', 'user'].includes(rawType)
    ? rawType
    : method === 'service'
      ? 'service'
      : 'strength';
  const purposes = preset.purposes?.length ? preset.purposes : candidatePurposes(preset.id, method);
  return {
    ...preset,
    type,
    method,
    purposes: [...new Set(purposes.map((item) => String(item).trim().toLowerCase()).filter(Boolean))],
    alternativeGroups: normalizeAlternativeGroups(preset.alternativeGroups),
    status: preset.status || 'candidate',
  };
}

function candidatePurposes(id, method) {
  if (id === 'KDS-ST-06' || id === 'KDS-ST-07') return ['strength', 'foundation', 'uplift'];
  if (id === 'KDS-ST-04' || id === 'KDS-ST-05') return ['strength', 'p-delta'];
  if (id === 'KDS-SVC-02') return ['service', 'deflection'];
  if (id === 'KDS-SVC-03' || id === 'KDS-SVC-04') return ['service', 'drift'];
  return [method];
}

function normalizeRulePack(input = {}) {
  const source = input?.id ? input : KDS_LOAD_RULE_PACK;
  const status = String(source.status || 'candidate').trim().toLowerCase();
  const rules = (source.rules || source.combinationPresets || []).map((rule) => withCandidatePresetMetadata({
    ...clonePlain(rule),
    status: rule.status || status,
  }));
  return {
    contractVersion: source.contractVersion || LOAD_RULE_PACK_CONTRACT_VERSION,
    id: String(source.id || 'UNVERSIONED-RULE-PACK'),
    authority: source.authority ?? null,
    code: source.code ?? null,
    edition: source.edition ?? null,
    editionDate: source.editionDate ?? null,
    amendmentsReviewed: Array.isArray(source.amendmentsReviewed) ? source.amendmentsReviewed.slice() : [],
    notice: source.notice ?? null,
    noticeDate: source.noticeDate ?? null,
    publicationStatus: source.publicationStatus || 'draft',
    effectiveDate: source.effectiveDate ?? null,
    verifiedAt: source.verifiedAt ?? null,
    sourceUrls: Array.isArray(source.sourceUrls) ? source.sourceUrls.slice() : [],
    sourceHash: source.sourceHash ?? null,
    status,
    verificationStatus: source.verificationStatus || status,
    evidenceStatus: source.evidenceStatus || status,
    sourceAttachmentStatus: source.sourceAttachmentStatus || (source.sourceUrls?.length ? 'source-linked' : 'unattached'),
    methods: uniqueLower(source.methods || rules.map((rule) => rule.method)),
    purposes: uniqueLower(source.purposes || rules.flatMap((rule) => rule.purposes)),
    automationStatus: source.automationStatus || (status === 'verified' ? 'eligible' : 'comparison-only'),
    factorEvidence: source.factorEvidence || null,
    rules,
  };
}

function rulePackMetadata(input) {
  const rulePack = normalizeRulePack(input);
  const { rules, ...metadata } = rulePack;
  return metadata;
}

function combinationGeneratedKey({ sourceId, sourcePreset, factors, method, purposes }) {
  const terms = Object.entries(factors || {})
    .filter(([, factor]) => Math.abs(Number(factor) || 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([caseId, factor]) => `${stableToken(caseId)}=${Number(factor) < 0 ? 'negative' : 'positive'}`)
    .join(',');
  return [
    'load-combination',
    stableToken(sourceId),
    stableToken(sourcePreset),
    stableToken(method || 'none'),
    uniqueLower(purposes || []).sort().map(stableToken).join('+') || 'none',
    terms || 'empty',
  ].join(':');
}

function compactCombinationFactors(combo) {
  const factors = Object.fromEntries(Object.entries(combo.factors || {})
    .filter(([, factor]) => Math.abs(Number(factor) || 0) > 0));
  return {
    ...combo,
    factors,
    name: formatCombinationFactors(factors) || combo.name,
    generatedKey: combinationGeneratedKey({
      sourceId: combo.sourceId,
      sourcePreset: combo.sourcePreset,
      factors,
      method: combo.method,
      purposes: combo.purposes,
    }),
  };
}

function uniqueLower(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
}

function stableToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'none';
}

function rule(id, name, type, method, terms, required = [], optional = [], alternativeGroups = [], directional = null, purposes = null) {
  return withCandidatePresetMetadata({
    id,
    name,
    type,
    method,
    terms,
    required,
    optional,
    alternativeGroups,
    directional,
    purposes: purposes || (method === 'strength'
      ? ['strength', 'p-delta']
      : ['service', 'deflection', 'drift']),
    basis: `KDS 41 12 00:2022 ${id.startsWith('KDS22-ST') ? 'strength' : 'allowable'} load combination.`,
    status: 'candidate',
  });
}

function alternativeGroup(id, symbols, required = true) {
  return {
    id: String(id),
    symbols: [...new Set((symbols || []).map(String).filter(Boolean))],
    required: required !== false,
  };
}

function normalizeAlternativeGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((group, index) => alternativeGroup(
    group?.id || `alternative-${index + 1}`,
    group?.symbols || group?.families || [],
    group?.required !== false,
  ));
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
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
