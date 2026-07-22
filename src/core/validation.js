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
import { validateUnitSystem } from './unitSystemValidation.js';
import { summarizeValidationHealth } from './validationHealth.js';
import {
  MEMBER_RELEASE_ENDS,
  MEMBER_ROTATIONAL_SPRING_KEYS,
  memberReleaseState,
} from './memberReleaseContract.js';
import { DIAPHRAGM_TYPES } from './diaphragmContract.js';
import { validateAnalysisCases } from './analysisCase.js';
import { validateAnalysisCriteria } from './analysisCriteria.js';
import { PROJECT_SETUP_STATUSES } from './projectSetup.js';
import { validateSourceRecord, validateSourceRegistry } from './sourceRegistry.js';
import { validateMaterialRecord } from '../materials/materialSchema.js';
import { validateSectionRecord } from '../materials/sectionSchema.js';
import { NONLINEAR_REGISTRY_COLLECTIONS, validateNonlinearRegistries } from './nonlinearSchema.js';
import { resolveMemberOffsetKinematics } from '../solver/memberOffsets.js';
import { validatePanelZoneInput } from '../solver/panelZone.js';
import { normalizeGeneralConstraints } from './constraintDefinitions.js';
import { resolveMemberTaper } from '../solver/taperedMember.js';

export function validateModel(model) {
  const errors = [];
  const warnings = [];
  const error = (code, message, target = null, details = null) => errors.push(issue('ERROR', code, message, target, details));
  const warning = (code, message, target = null, details = null) => warnings.push(issue('WARNING', code, message, target, details));

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
  warnings.push(...validateUnitSystem(model.unitSystem));
  validateCollections(model, error);
  validateOptionalCollections(model, error);
  validateShearDeformationSettings(model, error);

  if (errors.length) return finish(errors, warnings);

  const nodeIds = validateNodes(model, error, warning);
  validateDiaphragms(model, nodeIds, error);
  validateGeneralConstraints(model, error);
  validateLibraryCollections(model, error, warning);
  const sectionIds = knownIds(model.sections, SECTIONS);
  const materialIds = knownIds(model.materials, MATERIALS);
  validateShells(model, nodeIds, materialIds, error);
  const memberIds = validateMembers(model, nodeIds, sectionIds, materialIds, error);
  validateLoads(model, nodeIds, memberIds, error, warning);
  validateLoadCasesAndCombinations(model, error, warning);
  validatePhase7Contracts(model, error, warning);
  validateNonlinearRegistries(model).forEach((item) => error(ERROR_CODES[item.code] || item.code, item.message, item.target));
  validateAnalysisCases(model.analysisCases).forEach((item) => error(ERROR_CODES[item.code] || item.code, item.message, item.target));

  if ((model.members || []).length && !(model.nodes || []).some((node) => node.support)) {
    error(ERROR_CODES.NO_SUPPORT, 'Model has members but no support.', 'model');
  }

  warnings.push(...validateAnalysisCriteria(model.analysisCriteria));
  return finish(errors, warnings);
}

function validateCollections(model, error) {
  for (const key of ['nodes', 'members', 'loads', 'materials', 'sections', 'loadCases', 'loadCombinations', 'analysisCases', 'massSources', 'sourceRegistry', 'stories', 'diaphragms', ...NONLINEAR_REGISTRY_COLLECTIONS]) {
    if (!Array.isArray(model[key])) {
      error(ERROR_CODES.BAD_COLLECTION, `${key} must be an array.`, key);
    }
  }
}

function validatePhase7Contracts(model, error, warning) {
  if (!model.projectSetup || !PROJECT_SETUP_STATUSES.has(model.projectSetup.status)) {
    error(ERROR_CODES.BAD_PROJECT_SETUP, 'projectSetup must declare a supported status.', 'projectSetup');
  }
  const registry = validateSourceRegistry(model.sourceRegistry);
  if (!registry.ok) {
    error(ERROR_CODES.BAD_SOURCE_REGISTRY, `Invalid source registry: ${registry.errors.join(', ')}.`, 'sourceRegistry');
  }
  for (const source of model.sourceRegistry || []) {
    const result = validateSourceRecord(source);
    if (!result.ok) error(ERROR_CODES.BAD_SOURCE_RECORD, `Invalid source record ${source.id || '?'}.`, source.id || 'sourceRegistry');
    result.warnings.forEach((item) => warning(WARNING_CODES.NOT_SUPPORTED, `Source ${source.id || '?'} is missing ${item}.`, source.id || 'sourceRegistry'));
  }
  for (const source of model.massSources || []) {
    if (!source?.id || !Array.isArray(source.components)) {
      error(ERROR_CODES.BAD_MASS_SOURCE, 'Mass source requires id and components.', source?.id || 'massSources');
    }
  }
}

function validateOptionalCollections(model, error) {
  for (const key of ['shells', 'slabs', 'slabPanels']) {
    if (model[key] != null && !Array.isArray(model[key])) {
      error(ERROR_CODES.BAD_COLLECTION, `${key} must be an array when provided.`, key);
    }
  }
}

function validateShearDeformationSettings(model, error) {
  const settings = model.analysisSettings;
  if (settings != null && (typeof settings !== 'object' || Array.isArray(settings))) {
    error(ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING, 'analysisSettings must be an object when provided.', 'analysisSettings');
    return;
  }
  validateBooleanSetting(settings, 'shearDeformation', 'analysisSettings.shearDeformation', error);
  validateBooleanSetting(settings, 'includeShearDeformation', 'analysisSettings.includeShearDeformation', error);
  if (typeof settings?.shearDeformation === 'boolean'
    && typeof settings?.includeShearDeformation === 'boolean'
    && settings.shearDeformation !== settings.includeShearDeformation) {
    error(
      ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING,
      'Conflicting canonical and legacy shear-deformation settings are not allowed.',
      'analysisSettings.shearDeformation',
    );
  }
}

function validateBooleanSetting(holder, key, target, error) {
  if (!holder || !Object.prototype.hasOwnProperty.call(holder, key)) return;
  if (typeof holder[key] !== 'boolean') {
    error(ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING, `${target} must be a boolean.`, target);
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
    if (node.support === 'spring' && !hasValidSpring(node.spring)) {
      error(ERROR_CODES.BAD_CUSTOM_SUPPORT, 'Spring support requires finite nonnegative stiffness values and at least one positive stiffness.', node.id);
    }
    if (node.settlement) {
      if (!['fixed', 'spring'].includes(node.support)) {
        error(ERROR_CODES.BAD_CUSTOM_SUPPORT, 'Settlement requires fixed or spring support.', node.id);
      }
      if (!hasValidSettlement(node.settlement)) {
        error(ERROR_CODES.BAD_CUSTOM_SUPPORT, 'Settlement must contain only finite displacement/rotation values and at least one nonzero value.', node.id);
      }
    }
    const panelZone = validatePanelZoneInput(node.panelZone, node.id || null);
    if (!panelZone.ok) error(ERROR_CODES.BAD_PANEL_ZONE, panelZone.message, node.id || 'nodes');
    if (!usedNodes.has(node.id)) warning(WARNING_CODES.FREE_NODE, 'Node is not connected to any member.', node.id);
  }

  return nodeIds;
}

function validateDiaphragms(model, nodeIds, error) {
  for (const item of model.diaphragms || []) {
    if (!DIAPHRAGM_TYPES.includes(item.type)) {
      error(ERROR_CODES.BAD_DIAPHRAGM_TYPE, `Unsupported diaphragm type: ${item.type}`, item.id || 'diaphragms');
    }
    if (item.type === 'semiRigid') {
      if (!Array.isArray(item.nodeIds) || item.nodeIds.length < 2) {
        error(ERROR_CODES.BAD_DIAPHRAGM_PROPS, 'Semi-rigid diaphragm requires at least two node references.', item.id || 'diaphragms');
      }
      if (!(isFiniteNumber(item.inPlaneStiffness) && Number(item.inPlaneStiffness) > 0)) {
        error(ERROR_CODES.BAD_DIAPHRAGM_PROPS, 'Semi-rigid diaphragm requires positive inPlaneStiffness.', item.id || 'diaphragms');
      }
    }
    for (const nodeId of item.nodeIds || []) {
      if (!nodeIds.has(nodeId)) error(ERROR_CODES.BAD_DIAPHRAGM_NODE_REF, 'Diaphragm references a missing node.', item.id || nodeId);
    }
  }
}

function validateGeneralConstraints(model, error) {
  const fixedDofs = validationFixedDofs(model.nodes || []);
  const normalized = normalizeGeneralConstraints(model.constraints || [], model.nodes || [], { fixedDofs });
  for (const item of normalized.errors) {
    error(ERROR_CODES[item.code] || item.code, item.message, item.constraintId || 'constraints', item.location);
  }
}

function validationFixedDofs(nodes) {
  const fixed = new Set();
  nodes.forEach((node, nodeIndex) => {
    const flags = node.support === 'fixed' ? [1, 1, 1, 1, 1, 1]
      : node.support === 'pin' ? [1, 1, 1, 0, 0, 0]
        : node.support === 'roller' ? [0, 0, 1, 0, 0, 0]
          : node.support === 'custom' && Array.isArray(node.fix) ? node.fix : [];
    flags.slice(0, 6).forEach((value, component) => {
      if (value === true || value === 1) fixed.add(nodeIndex * 6 + component);
    });
  });
  return fixed;
}

function validateShells(model, nodeIds, materialIds, error) {
  const shells = [
    ...(model.shells || []),
    ...(model.slabs || []).filter((item) => item?.type === 'shell'),
  ];
  for (const shell of shells) {
    const id = shell.id || 'shells';
    const ids = shellNodeIds(shell);
    if (ids.length !== 4) {
      error(ERROR_CODES.BAD_SHELL_PROPS, 'Shell v1 requires exactly four node references.', id);
    }
    for (const nodeId of ids) {
      if (!nodeIds.has(nodeId)) error(ERROR_CODES.BAD_SHELL_NODE_REF, 'Shell references a missing node.', id);
    }
    if (!(isFiniteNumber(shell.thickness) && Number(shell.thickness) > 0)) {
      error(ERROR_CODES.BAD_SHELL_PROPS, 'Shell thickness must be positive.', id);
    }
    if (shell.formulation != null && !['equivalent', 'membrane', 'plate', 'shell', 'fem'].includes(shell.formulation)) {
      error(ERROR_CODES.BAD_SHELL_PROPS, 'Shell formulation must be equivalent, membrane, plate, shell, or fem.', id);
    }
    if (shell.matId && !materialIds.has(shell.matId)) {
      error(ERROR_CODES.NO_MATERIAL, `Missing material: ${shell.matId}`, id);
    }
    if (shell.material) {
      if (!(isFiniteNumber(shell.material.E) && Number(shell.material.E) > 0)) {
        error(ERROR_CODES.BAD_SHELL_PROPS, 'Shell material.E must be positive.', id);
      }
      if (shell.material.nu != null && !(isFiniteNumber(shell.material.nu) && Number(shell.material.nu) >= 0 && Number(shell.material.nu) < 0.5)) {
        error(ERROR_CODES.BAD_SHELL_PROPS, 'Shell material.nu must satisfy 0 <= nu < 0.5.', id);
      }
    }
  }
}

function validateLibraryCollections(model, error, warning) {
  validateLibraryCollection(model.materials, 'material', validateMaterialRecord, ERROR_CODES.BAD_MATERIAL_PROPS, error, warning);
  validateLibraryCollection(model.sections, 'section', validateSectionRecord, ERROR_CODES.BAD_SECTION_PROPS, error, warning);
}

function validateLibraryCollection(rows, kind, validator, code, error, warning) {
  const seen = new Set();
  for (const row of rows || []) {
    const id = String(row?.id || '').trim();
    const version = row?.version ?? 1;
    const reference = `${id}@${version}`;
    if (!id) error(code, `${kind} record is missing id.`, `${kind}s`);
    else if (seen.has(reference)) error(code, `Duplicate ${kind} record: ${reference}.`, reference);
    seen.add(reference);
    const checked = validator(row);
    if (!checked.ok) error(code, `Invalid ${kind} record ${reference}: ${checked.errors.join(', ')}.`, reference);
    for (const item of checked.warnings || []) warning(WARNING_CODES.NOT_SUPPORTED, `${kind} ${reference}: ${item}.`, reference);
    if (!strictLibraryNumbers(checked.normalized, kind)) error(code, `${kind} ${reference} contains nonnumeric or non-finite property values.`, reference);
  }
}

function strictLibraryNumbers(row, kind) {
  const source = kind === 'material' ? (row?.elastic || row) : (row?.properties || row);
  const required = kind === 'material' ? ['E', 'G'] : ['A', 'Iy', 'Iz'];
  const optional = kind === 'material' ? ['nu', 'rho', 'density', 'alpha'] : ['J', 'Ay', 'Az', 'Cw', 'Iyz'];
  return required.every((key) => typeof source?.[key] === 'number' && Number.isFinite(source[key]) && source[key] > 0)
    && optional.every((key) => source?.[key] == null || (typeof source[key] === 'number' && Number.isFinite(source[key])));
}

function shellNodeIds(shell = {}) {
  if (Array.isArray(shell.nodeIds)) return shell.nodeIds.filter(Boolean);
  if (Array.isArray(shell.nodes)) return shell.nodes.map((node) => node?.id).filter(Boolean);
  return [];
}

function validateMembers(model, nodeIds, sectionIds, materialIds, error) {
  const memberIds = new Set();
  const topology = new Map();
  for (const member of model.members || []) {
    if (!member.id) error(ERROR_CODES.MEMBER_MISSING_ID, 'A member is missing id.', 'members');
    else if (memberIds.has(member.id)) error(ERROR_CODES.DUPLICATE_MEMBER_ID, `Duplicate member id: ${member.id}`, member.id);
    memberIds.add(member.id);
    validateBooleanSetting(member, 'shearDeformation', `${member.id || 'members'}.shearDeformation`, error);
    validateBooleanSetting(member, 'includeShearDeformation', `${member.id || 'members'}.includeShearDeformation`, error);
    if (typeof member.shearDeformation === 'boolean'
      && typeof member.includeShearDeformation === 'boolean'
      && member.shearDeformation !== member.includeShearDeformation) {
      error(
        ERROR_CODES.BAD_SHEAR_DEFORMATION_SETTING,
        'Conflicting canonical and legacy member shear-deformation settings are not allowed.',
        `${member.id || 'members'}.shearDeformation`,
      );
    }

    if (!MEMBER_TYPES.has(member.type)) {
      error(ERROR_CODES.BAD_MEMBER_TYPE, `Unsupported member type: ${member.type}`, member.id);
    }
    if (!nodeIds.has(member.n1) || !nodeIds.has(member.n2)) {
      error(ERROR_CODES.BAD_MEMBER_NODE_REF, 'Member references a missing node.', member.id);
      continue;
    }

    const topologyKey = JSON.stringify([String(member.n1), String(member.n2)].sort());
    const duplicate = topology.get(topologyKey);
    if (duplicate) {
      const memberIdsForPair = [...duplicate.memberIds, member.id];
      error(
        ERROR_CODES.DUPLICATE_MEMBER,
        `Duplicate members share the same node pair: ${memberIdsForPair.join(', ')}.`,
        member.id,
        { memberIds: memberIdsForPair, nodeIds: [...duplicate.nodeIds] },
      );
      duplicate.memberIds.push(member.id);
    } else {
      topology.set(topologyKey, { memberIds: [member.id], nodeIds: [member.n1, member.n2] });
    }

    const a = model.nodes.find((node) => node.id === member.n1);
    const b = model.nodes.find((node) => node.id === member.n2);
    const length = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (length < 1e-9) {
      error(ERROR_CODES.ZERO_LENGTH_MEMBER, 'Member length is zero.', member.id, {
        memberIds: [member.id],
        nodeIds: [member.n1, member.n2],
      });
    }
    let resolvedSection = null;
    if (!member.secId || !sectionIds.has(member.secId)) error(ERROR_CODES.NO_SECTION, `Missing section: ${member.secId}`, member.id);
    else {
      const section = sectionOf(model, member.secId);
      resolvedSection = section;
      if (![section.A, section.Iy, section.Iz, section.J].every(positiveFiniteNumber)) {
        error(ERROR_CODES.BAD_SECTION_PROPS, `Section properties are incomplete: ${member.secId}`, member.id);
      }
    }

    if (!member.matId || !materialIds.has(member.matId)) error(ERROR_CODES.NO_MATERIAL, `Missing material: ${member.matId}`, member.id);
    else {
      const material = materialOf(model, member.matId);
      if (![material.E, material.G].every(positiveFiniteNumber)) {
        error(ERROR_CODES.BAD_MATERIAL_PROPS, `Material properties are incomplete: ${member.matId}`, member.id);
      }
    }

    validateMemberOffset(member, a, b, resolvedSection || {}, error);
    validateMemberTaper(model, member, resolvedSection || {}, error);
    validateMemberPanelZones(member, a, b, error);
    validateMemberReleases(member, error);
  }
  return memberIds;
}

function validateMemberTaper(model, member, section, error) {
  if (member.taper == null) return;
  const taper = resolveMemberTaper(model, member, section);
  if (taper?.ok) return;
  const code = ERROR_CODES[taper?.reason] || ERROR_CODES.BAD_MEMBER_TAPER;
  error(code, taper?.message || 'Member taper is invalid.', member.id);
}

function validateMemberReleases(member, error) {
  const releases = member.releases || {};
  for (const end of Object.keys(releases)) {
    if (![...MEMBER_RELEASE_ENDS, 'spring'].includes(end)) {
      error(ERROR_CODES.BAD_RELEASE_END, `Unsupported release end: ${end}`, member.id);
    }
  }
  for (const end of MEMBER_RELEASE_ENDS) {
    if (!RELEASE_TYPES.has(releases[end])) error(ERROR_CODES.BAD_RELEASE_TYPE, `Unsupported ${end}-end release: ${releases[end]}`, member.id);
  }
  for (const [field, end] of [['rel1', 'i'], ['rel2', 'j']]) {
    if (member[field] != null && !RELEASE_TYPES.has(member[field])) error(ERROR_CODES.BAD_RELEASE_TYPE, `Unsupported ${end}-end release: ${member[field]}`, member.id);
  }
  if (!Object.prototype.hasOwnProperty.call(releases, 'spring')) return;
  const spring = releases.spring;
  if (!spring || typeof spring !== 'object' || Array.isArray(spring)) {
    error(ERROR_CODES.BAD_RELEASE_SPRING, 'Member rotational spring must be an object.', member.id);
    return;
  }
  const keys = Object.keys(spring);
  for (const key of keys) {
    if (!MEMBER_ROTATIONAL_SPRING_KEYS.includes(key)) {
      error(ERROR_CODES.BAD_RELEASE_SPRING, `Unsupported rotational spring key: ${key}`, member.id);
      continue;
    }
    const stiffness = spring[key];
    if (typeof stiffness !== 'number' || !Number.isFinite(stiffness) || stiffness < 0) {
      error(
        ERROR_CODES.BAD_RELEASE_SPRING,
        `Rotational spring ${key} must be a finite nonnegative number.`,
        member.id,
      );
    }
  }
  if (keys.some((key) => MEMBER_ROTATIONAL_SPRING_KEYS.includes(key))
    && ['truss', 'tensionOnly', 'compressionOnly'].includes(member.behavior || member.type)) {
    error(
      ERROR_CODES.RELEASE_SPRING_FRAME_REQUIRED,
      'Rotational connection springs require frame member behavior.',
      member.id,
    );
  }
  const releaseState = memberReleaseState(member);
  const iConflict = releaseState.i === 'pin' && keys.some((key) => key.endsWith('I'));
  const jConflict = releaseState.j === 'pin' && keys.some((key) => key.endsWith('J'));
  if (iConflict || jConflict) {
    error(
      ERROR_CODES.RELEASE_SPRING_CONFLICT,
      'A binary pin and a rotational spring cannot be assigned at the same member end.',
      member.id,
    );
  }
}

function validateMemberOffset(member, a, b, section, error) {
  if (!member.endOffset && member.insertionPoint == null) return;
  const resolved = resolveMemberOffsetKinematics(member, a, b, section);
  if (resolved.ok) return;
  const code = resolved.reason === 'INVALID_MEMBER_INSERTION_POINT'
    || resolved.reason === 'MEMBER_INSERTION_POINT_SECTION_DIMENSIONS_REQUIRED'
    ? ERROR_CODES.BAD_MEMBER_INSERTION_POINT
    : ERROR_CODES.BAD_MEMBER_OFFSET;
  error(code, resolved.message, member.id);
}

function validateMemberPanelZones(member, a, b, error) {
  const ends = [['i', a], ['j', b]];
  const behavior = member.behavior || member.type || 'frame';
  for (const [end, node] of ends) {
    if (!node?.panelZone) continue;
    if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
      error(ERROR_CODES.PANEL_ZONE_FRAME_REQUIRED, 'Panel-zone rotational springs require frame member behavior.', member.id);
      continue;
    }
    const axis = node.panelZone.axis || (member.localAxis?.strongAxis === 'y' ? 'y' : 'z');
    const key = `r${axis}${end === 'i' ? 'I' : 'J'}`;
    if (Object.prototype.hasOwnProperty.call(member.releases?.spring || {}, key)) {
      error(
        ERROR_CODES.PANEL_ZONE_SPRING_CONFLICT,
        `Panel zone and explicit member spring both assign ${key}.`,
        member.id,
      );
    }
  }
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
    if ((load.type === 'pressure' || load.type === 'shellPressure')
      && (!(load.shell || load.panel || load.target) || !isFiniteNumber(load.q ?? load.pressure ?? load.w))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Shell pressure requires a shell target and finite q/pressure/w.', load.id);
    }
    if ((load.type === 'udl' || load.type === 'udl-partial') && (!load.member || !isFiniteNumber(load.w))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'UDL requires member and finite w.', load.id);
    }
    if (load.type === 'udl-partial') validateLoadRange(load, error);
    if (load.type === 'trapezoid' && (!load.member || !isFiniteNumber(load.w1) || !isFiniteNumber(load.w2))) {
      error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Trapezoid load requires member and finite w1/w2.', load.id);
    }
    if (load.type === 'trapezoid') validateLoadRange(load, error);
    if (load.type === 'mmoment') {
      if (!load.member || !isFiniteNumber(load.M) || !isFiniteNumber(load.at) || load.at < 0 || load.at > 1) {
        error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Member moment requires member, finite M, and at between 0 and 1.', load.id);
      }
    }
    if (load.type === 'temperature') {
      if (!load.member || !isFiniteNumber(load.dT)) error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Temperature load requires member and finite dT.', load.id);
    }
    if (load.type === 'tgradient') {
      if (!load.member || !isFiniteNumber(load.dTtop) || !isFiniteNumber(load.dTbot) || !isFiniteNumber(load.h) || !(Number(load.h) > 0)) {
        error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Temperature gradient requires member, finite dTtop/dTbot, and positive h.', load.id);
      }
    }
    if (load.type === 'point') {
      if (!load.member || !isFiniteNumber(load.P)) error(ERROR_CODES.BAD_LOAD_MAGNITUDE, 'Point load requires member and finite P.', load.id);
      if (!isFiniteNumber(load.t) || load.t < 0 || load.t > 1) error(ERROR_CODES.BAD_POINT_LOAD_LOCATION, 'Point load t must be between 0 and 1.', load.id);
    }
  }
}

function validateLoadRange(load, error) {
  if (!isFiniteNumber(load.from) || !isFiniteNumber(load.to) || load.from < 0 || load.to > 1 || Number(load.from) >= Number(load.to)) {
    error(ERROR_CODES.BAD_POINT_LOAD_LOCATION, 'Distributed load range must satisfy 0 <= from < to <= 1.', load.id);
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
      if (!isFiniteNumber(factor)) {
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
    if (item.id && item.version != null) ids.add(`${item.id}@${item.version}`);
  }
  for (const id of Object.keys(catalogMap)) ids.add(`${id}@1`);
  return ids;
}

function issue(level, code, message, target, details = null) {
  return {
    level,
    code,
    message,
    target,
    ...(details && typeof details === 'object' ? details : {}),
  };
}

function finish(errors, warnings) {
  const base = { ok: errors.length === 0, errors, warnings };
  return { ...base, ...summarizeValidationHealth(base) };
}

function isFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value));
  return false;
}

function hasValidSpring(spring = {}) {
  const keys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  if (!spring || typeof spring !== 'object' || Array.isArray(spring)) return false;
  if (Object.keys(spring).some((key) => !keys.includes(key))) return false;
  const supplied = keys.filter((key) => spring[key] != null);
  return supplied.length > 0
    && supplied.every((key) => typeof spring[key] === 'number' && Number.isFinite(spring[key]) && spring[key] >= 0)
    && supplied.some((key) => spring[key] > 0);
}

function hasValidSettlement(settlement = {}) {
  const keys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  if (!settlement || typeof settlement !== 'object' || Array.isArray(settlement)) return false;
  if (Object.keys(settlement).some((key) => !keys.includes(key))) return false;
  const supplied = keys.filter((key) => settlement[key] != null);
  return supplied.length > 0
    && supplied.every((key) => typeof settlement[key] === 'number' && Number.isFinite(settlement[key]))
    && supplied.some((key) => settlement[key] !== 0);
}

function positiveFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
