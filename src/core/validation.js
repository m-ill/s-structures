import { MATERIALS, SECTIONS, materialOf, sectionOf } from './catalogs.js';
import {
  COMBINATION_TYPES,
  ERROR_CODES,
  LOAD_CASE_TYPES,
  LOAD_TYPES,
  MEMBER_TYPES,
  RELEASE_TYPES,
  SCHEMA_VERSION,
  SUPPORT_TYPES,
  WARNING_CODES,
} from './schema.js';
import { validateUnits } from './units.js';

export function validateModel(model) {
  const errors = [];
  const warnings = [];
  const error = (code, message, target = null) => errors.push(issue('ERROR', code, message, target));
  const warning = (code, message, target = null) => warnings.push(issue('WARNING', code, message, target));

  if (!model) {
    error(ERROR_CODES.NO_MODEL, 'Model is missing.', 'model');
    return finish(errors, warnings);
  }
  if (typeof model !== 'object' || Array.isArray(model)) {
    error(ERROR_CODES.MODEL_NOT_OBJECT, 'Model must be an object.', 'model');
    return finish(errors, warnings);
  }
  if (model.schemaVersion !== SCHEMA_VERSION) {
    error(ERROR_CODES.BAD_SCHEMA_VERSION, `Model schemaVersion must be ${SCHEMA_VERSION}.`, 'schemaVersion');
  }

  warnings.push(...validateUnits(model.units));
  validateCollections(model, error);

  if (errors.length) return finish(errors, warnings);

  const nodeIds = validateNodes(model, error, warning);
  const sectionIds = knownIds(model.sections, SECTIONS);
  const materialIds = knownIds(model.materials, MATERIALS);
  const memberIds = validateMembers(model, nodeIds, sectionIds, materialIds, error);
  validateLoads(model, nodeIds, memberIds, error, warning);
  validateLoadCasesAndCombinations(model, error, warning);

  if ((model.members || []).length && !(model.nodes || []).some((node) => node.support)) {
    error(ERROR_CODES.NO_SUPPORT, 'Model has members but no support.', 'model');
  }

  if (model.analysisSettings?.includeShearDeformation) {
    warning(WARNING_CODES.NOT_SUPPORTED, 'Shear deformation is not implemented yet.', 'analysisSettings.includeShearDeformation');
  }
  return finish(errors, warnings);
}

function validateCollections(model, error) {
  for (const key of ['nodes', 'members', 'loads', 'materials', 'sections', 'loadCases', 'loadCombinations']) {
    if (!Array.isArray(model[key])) {
      error(ERROR_CODES.BAD_COLLECTION, `${key} must be an array.`, key);
    }
  }
}

function validateNodes(model, error, warning) {
  const nodeIds = new Set();
  const seenCoords = new Map();
  const usedNodes = new Set((model.members || []).flatMap((member) => [member.n1, member.n2]));

  for (const node of model.nodes || []) {
    if (!node.id) error(ERROR_CODES.NODE_MISSING_ID, 'A node is missing id.', 'nodes');
    else if (nodeIds.has(node.id)) error(ERROR_CODES.DUPLICATE_NODE_ID, `Duplicate node id: ${node.id}`, node.id);
    nodeIds.add(node.id);

    if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y) || !isFiniteNumber(node.z ?? 0)) {
      error(ERROR_CODES.BAD_NODE_COORDS, 'Node coordinates must be finite numbers.', node.id || 'nodes');
      continue;
    }

    const key = `${Number(node.x).toFixed(6)},${Number(node.y).toFixed(6)},${Number(node.z || 0).toFixed(6)}`;
    if (seenCoords.has(key)) warning(WARNING_CODES.DUPLICATE_NODE_COORDS, `Duplicate node coordinates: ${seenCoords.get(key)} and ${node.id}`, node.id);
    else seenCoords.set(key, node.id);

    if (!SUPPORT_TYPES.has(node.support)) {
      error(ERROR_CODES.BAD_SUPPORT_TYPE, `Unsupported support type: ${node.support}`, node.id);
    }
    if (node.support === 'custom' && (!Array.isArray(node.fix) || node.fix.length !== 6 || !node.fix.every((value) => typeof value === 'boolean'))) {
      error(ERROR_CODES.BAD_CUSTOM_SUPPORT, 'Custom support requires a six-item boolean fix array.', node.id);
    }
    if (!usedNodes.has(node.id)) warning(WARNING_CODES.FREE_NODE, 'Node is not connected to any member.', node.id);
  }

  return nodeIds;
}

function validateMembers(model, nodeIds, sectionIds, materialIds, error) {
  const memberIds = new Set();
  for (const member of model.members || []) {
    if (!member.id) error(ERROR_CODES.MEMBER_MISSING_ID, 'A member is missing id.', 'members');
    else if (memberIds.has(member.id)) error(ERROR_CODES.DUPLICATE_MEMBER_ID, `Duplicate member id: ${member.id}`, member.id);
    memberIds.add(member.id);

    if (!MEMBER_TYPES.has(member.type)) {
      error(ERROR_CODES.BAD_MEMBER_TYPE, `Unsupported member type: ${member.type}`, member.id);
    }
    if (!nodeIds.has(member.n1) || !nodeIds.has(member.n2)) {
      error(ERROR_CODES.BAD_MEMBER_NODE_REF, 'Member references a missing node.', member.id);
      continue;
    }

    const a = model.nodes.find((node) => node.id === member.n1);
    const b = model.nodes.find((node) => node.id === member.n2);
    if (Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)) < 1e-9) {
      error(ERROR_CODES.ZERO_LENGTH_MEMBER, 'Member length is zero.', member.id);
    }

    if (!member.secId || !sectionIds.has(member.secId)) error(ERROR_CODES.NO_SECTION, `Missing section: ${member.secId}`, member.id);
    else {
      const section = sectionOf(model, member.secId);
      if (!(section.A > 0 && section.Iy > 0 && section.Iz > 0 && section.J > 0)) {
        error(ERROR_CODES.BAD_SECTION_PROPS, `Section properties are incomplete: ${member.secId}`, member.id);
      }
    }

    if (!member.matId || !materialIds.has(member.matId)) error(ERROR_CODES.NO_MATERIAL, `Missing material: ${member.matId}`, member.id);
    else {
      const material = materialOf(model, member.matId);
      if (!(material.E > 0 && material.G > 0)) {
        error(ERROR_CODES.BAD_MATERIAL_PROPS, `Material properties are incomplete: ${member.matId}`, member.id);
      }
    }

    for (const [end, release] of Object.entries(member.releases || {})) {
      if ((end === 'i' || end === 'j') && !RELEASE_TYPES.has(release)) {
        error(ERROR_CODES.BAD_RELEASE_TYPE, `Unsupported ${end}-end release: ${release}`, member.id);
      }
    }
  }
  return memberIds;
}

function validateLoads(model, nodeIds, memberIds, error, warning) {
  const loadIds = new Set();
  const loadCaseIds = new Set((model.loadCases || []).map((loadCase) => loadCase.id));
  for (const load of model.loads || []) {
    if (!load.id) error(ERROR_CODES.LOAD_MISSING_ID, 'A load is missing id.', 'loads');
    else if (loadIds.has(load.id)) error(ERROR_CODES.DUPLICATE_LOAD_ID, `Duplicate load id: ${load.id}`, load.id);
    loadIds.add(load.id);

    if (!LOAD_TYPES.has(load.type)) error(ERROR_CODES.BAD_LOAD_TYPE, `Unsupported load type: ${load.type}`, load.id);
    if (load.member && !memberIds.has(load.member)) error(ERROR_CODES.BAD_LOAD_MEMBER_REF, 'Load references a missing member.', load.id);
    if (load.node && !nodeIds.has(load.node)) error(ERROR_CODES.BAD_LOAD_NODE_REF, 'Load references a missing node.', load.id);
    if (load.case && loadCaseIds.size && !loadCaseIds.has(load.case)) {
      warning(WARNING_CODES.BAD_LOAD_CASE_REF, `Load references an undefined load case: ${load.case}`, load.id);
    }

    if (load.type === 'nodal' && (!load.node || !isFiniteNumber(load.P))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Nodal load requires node and finite P.', load.id);
    }
    if (load.type === 'nmoment' && (!load.node || !isFiniteNumber(load.M))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Nodal moment requires node and finite M.', load.id);
    }
    if (load.type === 'udl' && (!load.member || !isFiniteNumber(load.w))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'UDL requires member and finite w.', load.id);
    }
    if (load.type === 'point') {
      if (!load.member || !isFiniteNumber(load.P)) error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Point load requires member and finite P.', load.id);
      if (!isFiniteNumber(load.t) || load.t < 0 || load.t > 1) error(ERROR_CODES.BAD_POINT_LOAD_LOCATION, 'Point load t must be between 0 and 1.', load.id);
    }
  }
}

function validateLoadCasesAndCombinations(model, error, warning) {
  const loadCaseIds = new Set();
  for (const loadCase of model.loadCases || []) {
    if (!loadCase.id) error(ERROR_CODES.LOAD_CASE_MISSING_ID, 'A load case is missing id.', 'loadCases');
    else if (loadCaseIds.has(loadCase.id)) error(ERROR_CODES.DUPLICATE_LOAD_CASE_ID, `Duplicate load case id: ${loadCase.id}`, loadCase.id);
    loadCaseIds.add(loadCase.id);
    if (loadCase.type && !LOAD_CASE_TYPES.has(loadCase.type)) {
      error(ERROR_CODES.BAD_LOAD_CASE_TYPE, `Unsupported load case type: ${loadCase.type}`, loadCase.id);
    }
  }

  const comboIds = new Set();
  const comboCaseIds = new Set();
  for (const combo of model.loadCombinations || []) {
    if (!combo.id) error(ERROR_CODES.COMBO_MISSING_ID, 'A load combination is missing id.', 'loadCombinations');
    else if (comboIds.has(combo.id)) error(ERROR_CODES.DUPLICATE_COMBO_ID, `Duplicate combination id: ${combo.id}`, combo.id);
    comboIds.add(combo.id);
    if (!COMBINATION_TYPES.has(combo.type)) error(ERROR_CODES.BAD_COMBO_FACTORS, `Unsupported combination type: ${combo.type}`, combo.id);

    if (!combo.factors || typeof combo.factors !== 'object' || Array.isArray(combo.factors)) {
      error(ERROR_CODES.BAD_COMBO_FACTORS, 'Combination factors must be an object.', combo.id);
      continue;
    }
    for (const [caseId, factor] of Object.entries(combo.factors)) {
      comboCaseIds.add(caseId);
      if (!Number.isFinite(Number(factor))) {
        error(ERROR_CODES.BAD_COMBO_FACTORS, `Combination factor must be finite: ${caseId}`, combo.id);
      }
      if (loadCaseIds.size && !loadCaseIds.has(caseId)) {
        warning(WARNING_CODES.BAD_COMBO_CASE_REF, `Combination references an undefined load case: ${caseId}`, combo.id);
      }
    }
  }

  for (const loadCase of model.loadCases || []) {
    const hasLoad = (model.loads || []).some((load) => (load.case || model.loadCases[0]?.id) === loadCase.id);
    if (hasLoad && !comboCaseIds.has(loadCase.id)) {
      warning(WARNING_CODES.LOAD_CASE_UNUSED, `Load case ${loadCase.id} is not included in any combination.`, loadCase.id);
    }
  }
}

function knownIds(customItems, catalogMap) {
  const ids = new Set(Object.keys(catalogMap));
  for (const item of customItems || []) {
    if (item.id) ids.add(item.id);
  }
  return ids;
}

function issue(level, code, message, target) {
  return { level, code, message, target };
}

function finish(errors, warnings) {
  return { ok: errors.length === 0, errors, warnings };
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}
