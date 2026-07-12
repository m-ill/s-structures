import { stableHash } from './stableHash.js';

export const ANALYSIS_DOMAIN_HASH_CONTRACT_VERSION = 'p8-m0-analysis-domain-hashes-v1';

export function buildAnalysisDomainHashes(model = {}, analysisCase = null) {
  const hashes = {
    topologyHash: hash({
      nodes: rows(model.nodes, ['id', 'x', 'y', 'z']),
      members: rows(model.members, ['id', 'type', 'n1', 'n2']),
      shells: clone(model.shells || []),
      slabs: clone(model.slabs || []),
      walls: clone(model.walls || []),
    }),
    propertyHash: hash({
      materials: clone(model.materials || []),
      sections: clone(model.sections || []),
      memberAssignments: rows(model.members, ['id', 'matId', 'secId', 'modifiers', 'role']),
    }),
    constraintHash: hash({
      supports: rows(model.nodes, ['id', 'support', 'fix', 'spring']),
      diaphragms: clone(model.diaphragms || []),
      memberKinematics: rows(model.members, ['id', 'localAxis', 'releases', 'rel1', 'rel2', 'offsets', 'offsetI', 'offsetJ']),
    }),
    loadHash: hash({
      loadCases: clone(model.loadCases || []),
      loadCombinations: clone(model.loadCombinations || []),
      loads: clone(model.loads || []),
      prescribed: rows(model.nodes, ['id', 'settlement']),
      selfWeight: model.analysisSettings?.includeSelfWeight ?? null,
    }),
    massHash: hash({
      massSources: clone(model.massSources || []),
      nodeMasses: rows(model.nodes, ['id', 'mass']),
      materialMass: (model.materials || []).map((item) => ({
        id: item.id,
        version: item.version ?? 1,
        density: item.density ?? item.rho ?? item.elastic?.density ?? null,
      })),
      sectionAreas: (model.sections || []).map((item) => ({
        id: item.id,
        version: item.version ?? 1,
        A: item.A ?? item.properties?.A ?? null,
      })),
    }),
    nonlinearHash: hash({
      nonlinearMaterials: clone(model.nonlinearMaterials || []),
      nonlinearSections: clone(model.nonlinearSections || []),
      hingeProperties: clone(model.hingeProperties || []),
      linkProperties: clone(model.linkProperties || []),
      memberAssignments: rows(model.members, ['id', 'nonlinear']),
      legacyMaterialData: rows(model.materials, ['id', 'version', 'nonlinear']),
    }),
    outputHash: hash({
      caseId: analysisCase?.id || null,
      outputPolicy: clone(analysisCase?.outputPolicy || analysisCase?.output || {}),
      outputSettings: clone(analysisCase?.settings?.output || {}),
    }),
  };
  return {
    version: ANALYSIS_DOMAIN_HASH_CONTRACT_VERSION,
    ...hashes,
    domainHash: hash(hashes),
  };
}

export function changedAnalysisDomainHashes(before = {}, after = {}) {
  const keys = [
    'topologyHash',
    'propertyHash',
    'constraintHash',
    'loadHash',
    'massHash',
    'nonlinearHash',
    'outputHash',
  ];
  return keys.filter((key) => before?.[key] !== after?.[key]);
}

function rows(values, keys) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Object.fromEntries(keys.map((key) => [key, clone(value?.[key] ?? null)])))
    .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

function hash(value) {
  return stableHash(value).slice(0, 24);
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
