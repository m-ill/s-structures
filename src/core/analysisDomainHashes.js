import { stableHash } from './stableHash.js';
import { resolveGlobalShearDeformation } from './shearDeformation.js';

export const ANALYSIS_DOMAIN_HASH_CONTRACT_VERSION = 'p8-m1-analysis-domain-hashes-v2';

export function buildAnalysisDomainHashes(model = {}, analysisCase = null) {
  const hashes = {
    topologyHash: hash({
      nodes: rows(model.nodes, ['id', 'x', 'y', 'z']),
      members: rows(model.members, ['id', 'type', 'n1', 'n2']),
      shells: sortedRecords(model.shells || []),
      slabs: sortedRecords(model.slabs || []),
      walls: sortedRecords(model.walls || []),
    }),
    propertyHash: hash({
      materials: sortedRecords(model.materials || []),
      sections: sortedRecords(model.sections || []),
      memberAssignments: rows(model.members, [
        'id', 'matId', 'secId', 'modifiers', 'customProps', 'role', 'shearDeformation', 'includeShearDeformation',
      ]),
      shearDeformation: resolveGlobalShearDeformation(model),
    }),
    constraintHash: hash({
      supports: rows(model.nodes, ['id', 'support', 'fix', 'spring', 'settlement', 'prescribed', 'prescribedDisplacement', 'panelZone']),
      diaphragms: sortedRecords(model.diaphragms || []),
      constraints: sortedRecords(model.constraints || []),
      memberKinematics: rows(model.members, ['id', 'localAxis', 'releases', 'rel1', 'rel2', 'endOffset', 'insertionPoint', 'offsets', 'offsetI', 'offsetJ']),
    }),
    loadHash: hash({
      loadCases: sortedRecords(model.loadCases || []),
      loadCombinations: sortedRecords(model.loadCombinations || []),
      loads: sortedRecords(model.loads || []),
      prescribed: rows(model.nodes, ['id', 'settlement']),
      selfWeight: model.analysisSettings?.includeSelfWeight ?? null,
    }),
    massHash: hash({
      massSources: sortedRecords(model.massSources || []),
      nodeMasses: rows(model.nodes, ['id', 'mass']),
      materialMass: sortedRecords((model.materials || []).map((item) => ({
        id: item.id,
        version: item.version ?? 1,
        density: item.density ?? item.rho ?? item.elastic?.density ?? null,
      }))),
      sectionAreas: sortedRecords((model.sections || []).map((item) => ({
        id: item.id,
        version: item.version ?? 1,
        A: item.A ?? item.properties?.A ?? null,
      }))),
    }),
    nonlinearHash: hash({
      nonlinearMaterials: sortedRecords(model.nonlinearMaterials || []),
      nonlinearSections: sortedRecords(model.nonlinearSections || []),
      hingeProperties: sortedRecords(model.hingeProperties || []),
      linkProperties: sortedRecords(model.linkProperties || []),
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
    .sort(compareRecords);
}

function hash(value) {
  return stableHash(value).slice(0, 24);
}

function sortedRecords(values) {
  return clone(Array.isArray(values) ? values : []).sort(compareRecords);
}

function compareRecords(a, b) {
  const byId = String(a?.id || '').localeCompare(String(b?.id || ''));
  return byId || stableHash(a).localeCompare(stableHash(b));
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
