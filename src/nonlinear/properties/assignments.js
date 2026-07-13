import { stableHash } from '../../core/stableHash.js';
import { materialOf, sectionOf } from '../../core/catalogs.js';
import { applyModelChangeSet } from '../../modeling/transaction.js';
import {
  createHingeProperty,
  createHingePropertyRegistry,
  evaluateHingePropertyAtAxialRatio,
  hingePropertyRequiresGeneralMatrix,
  resolveHingeProperty,
} from './hingeRegistry.js';

export const HINGE_ASSIGNMENT_CONTRACT_VERSION = 'p8-m4-hinge-assignment-v1';
export const HINGE_ASSIGNMENT_CHANGE_SET_VERSION = 'p8-m4-hinge-assignment-change-set-v1';
export const HINGE_ASSIGNMENT_AXES = Object.freeze(['y', 'z']);
export const HINGE_ASSIGNMENT_ENDS = Object.freeze(['i', 'j']);

export function normalizeHingeAssignment(input = {}, memberId = input.memberId) {
  const member = requiredId(memberId, 'member');
  const end = normalizeChoice(input.end, HINGE_ASSIGNMENT_ENDS, 'HINGE_ASSIGNMENT_END_INVALID');
  const axis = normalizeChoice(input.axis, HINGE_ASSIGNMENT_AXES, 'HINGE_ASSIGNMENT_AXIS_INVALID');
  const propertyId = requiredId(input.propertyId, 'hinge property');
  const id = clean(input.id) || `${member}:${end}:${axis}`;
  const expectedLocation = end === 'i' ? 0 : 1;
  const location = input.location == null ? expectedLocation : finite(input.location, 'assignment.location');
  if (Math.abs(location - expectedLocation) > 1e-12) {
    throw assignmentError('HINGE_ASSIGNMENT_END_LOCATION_MISMATCH', `${id} end and location are inconsistent.`);
  }
  const source = normalizeAssignmentSource(input.source || {});
  return deepFreeze({
    version: HINGE_ASSIGNMENT_CONTRACT_VERSION,
    id,
    memberId: member,
    propertyId,
    end,
    axis,
    location,
    axialRatio: input.axialRatio == null ? null : finite(input.axialRatio, 'assignment.axialRatio'),
    source,
    override: clone(input.override || null),
    qualification: clean(input.qualification) || null,
  });
}

export function resolveDomainHingeAssignments(domain, options = {}) {
  if (!domain?.ok || !Array.isArray(domain.elements)) {
    throw assignmentError('HINGE_ASSIGNMENT_DOMAIN_INVALID', 'A valid canonical analysis domain is required.');
  }
  const registry = createHingePropertyRegistry(domain.snapshot?.nonlinear?.hingeProperties || []);
  const byElement = {};
  const rows = [];
  for (const descriptor of domain.elements) {
    const assignments = Array.isArray(descriptor.nonlinear?.hinges) ? descriptor.nonlinear.hinges : [];
    const seen = new Set();
    for (const input of assignments) {
      const assignment = normalizeHingeAssignment(input, descriptor.id);
      const key = `${assignment.end}:${assignment.axis}`;
      if (seen.has(key)) throw assignmentError('HINGE_ASSIGNMENT_DUPLICATE', `Duplicate hinge assignment ${descriptor.id}:${key}.`);
      seen.add(key);
      validateReleaseConflict(descriptor, assignment);
      const baseProperty = resolveHingeProperty(registry, assignment.propertyId, options);
      const requestedAxialRatio = resolveAxialRatio(assignment, descriptor, options);
      const evaluated = evaluateHingePropertyAtAxialRatio(baseProperty, requestedAxialRatio, options);
      const pmmInteraction = resolvePmmInteraction(options.pmmInteractions, descriptor.id, assignment.axis);
      const row = deepFreeze({
        ...assignment,
        source: {
          ...clone(assignment.source),
          propertyHash: evaluated.property.contentHash,
        },
        qualification: assignment.qualification || evaluated.property.qualification,
        property: evaluated.property,
        baseProperty,
        basePropertyId: baseProperty.id,
        pmmInteraction,
        axialRatioTrace: {
          requested: evaluated.requestedAxialRatio,
          applied: evaluated.axialRatioApplied,
          source: evaluated.source,
          interpolation: evaluated.interpolation,
          iterationCoupled: Boolean(pmmInteraction),
        },
        localDof: hingeLocalDof(assignment.end, assignment.axis),
        requiredMatrixClass: pmmInteraction || hingePropertyRequiresGeneralMatrix(evaluated.property) ? 'general' : 'spd',
      });
      rows.push(row);
      (byElement[descriptor.id] ||= []).push(row);
    }
  }
  for (const id of Object.keys(byElement)) byElement[id].sort(assignmentSort);
  rows.sort((a, b) => `${a.memberId}:${a.end}:${a.axis}`.localeCompare(`${b.memberId}:${b.end}:${b.axis}`));
  const core = {
    version: HINGE_ASSIGNMENT_CONTRACT_VERSION,
    registryHash: registry.contentHash,
    rows,
    byElement,
  };
  return deepFreeze({ ...core, contentHash: stableHash(core).slice(0, 24) });
}

export function previewHingeAssignmentChangeSet(model = {}, options = {}) {
  const memberIds = options.memberIds ? new Set(options.memberIds.map(String)) : null;
  const members = (model.members || []).filter((member) => !memberIds || memberIds.has(String(member.id)));
  const ends = normalizeChoices(options.ends || HINGE_ASSIGNMENT_ENDS, HINGE_ASSIGNMENT_ENDS, 'HINGE_ASSIGNMENT_END_INVALID');
  const axes = normalizeChoices(options.axes || HINGE_ASSIGNMENT_AXES, HINGE_ASSIGNMENT_AXES, 'HINGE_ASSIGNMENT_AXIS_INVALID');
  const changes = [];
  const assignments = [];
  const properties = [];
  const warnings = [];
  const errors = [];
  const existingProperties = new Map((model.hingeProperties || []).map((row) => [row.id, row]));
  for (const member of members) {
    if (member.generated === true) {
      warnings.push(issue('HINGE_AUTO_GENERATED_MEMBER_SKIPPED', member.id, 'Generated members do not receive automatic hinges.'));
      continue;
    }
    const context = memberContext(model, member);
    for (const axis of axes) {
      let property;
      try {
        property = buildAutoHingeProperty(context, axis, options);
      } catch (error) {
        errors.push(issue(error.code || 'HINGE_AUTO_PROPERTY_FAILED', `${member.id}:${axis}`, error.message));
        continue;
      }
      const propertyOverride = options.propertyOverrides?.[property.id];
      if (propertyOverride) {
        property = createHingeProperty({
          ...clone(property),
          ...clone(propertyOverride),
          id: property.id,
          parameters: deepMerge(property.parameters, propertyOverride.parameters || {}),
          source: {
            ...clone(property.source),
            type: 'user-override',
            extra: {
              ...(property.source?.extra || {}),
              autoPropertyHash: property.contentHash,
              overrideFields: leafPaths(propertyOverride),
            },
          },
        });
      }
      properties.push(property);
      const existing = existingProperties.get(property.id);
      changes.push(existing
        ? { op: 'replace', collection: 'hingeProperties', id: property.id, value: property }
        : { op: 'add', collection: 'hingeProperties', id: property.id, value: property });
      for (const end of ends) {
        const assignmentId = `${member.id}:${end}:${axis}`;
        const assignmentOverride = options.assignmentOverrides?.[assignmentId] || {};
        const assignment = normalizeHingeAssignment({
          id: assignmentId,
          memberId: member.id,
          end,
          axis,
          propertyId: assignmentOverride.propertyId || property.id,
          axialRatio: assignmentOverride.axialRatio ?? null,
          qualification: property.qualification,
          override: Object.keys(assignmentOverride).length ? assignmentOverride : null,
          source: {
            mode: Object.keys(assignmentOverride).length ? 'user-override' : 'auto',
            generator: HINGE_ASSIGNMENT_CHANGE_SET_VERSION,
            propertyHash: property.contentHash,
            assumption: property.source.assumption,
            overrideFields: leafPaths(assignmentOverride),
          },
        }, member.id);
        assignments.push(assignment);
      }
    }
    const prior = Array.isArray(member.nonlinear?.hinges) ? member.nonlinear.hinges : [];
    const generated = assignments.filter((row) => row.memberId === member.id);
    const retained = prior.filter((row) => !generated.some((item) => item.end === row.end && item.axis === row.axis));
    changes.push({
      op: 'update',
      collection: 'members',
      id: member.id,
      patch: {
        nonlinear: {
          ...(clone(member.nonlinear || {})),
          formulation: 'concentrated-plasticity',
          hinges: [...retained, ...generated].sort(assignmentSort),
        },
      },
    });
  }
  for (const conflict of propertyIdConflicts(properties)) {
    errors.push(issue(
      'HINGE_AUTO_PROPERTY_ID_CONFLICT',
      conflict.id,
      `Property ID ${conflict.id} was generated from different member snapshots.`,
    ));
  }
  const deduplicated = deduplicatePropertyChanges(changes);
  const core = {
    version: HINGE_ASSIGNMENT_CHANGE_SET_VERSION,
    id: clean(options.id) || `hinge-assignment:${stableHash({ memberIds: [...(memberIds || [])], ends, axes, assignments }).slice(0, 16)}`,
    name: clean(options.name) || 'Assign concentrated plastic hinges',
    status: errors.length ? 'blocked' : 'ready',
    changes: deduplicated,
    properties: uniqueById(properties),
    assignments: assignments.sort(assignmentSort),
    diff: assignments.map((assignment) => ({
      assignmentId: assignment.id,
      mode: assignment.source.mode,
      propertyId: assignment.propertyId,
      propertyHash: assignment.source.propertyHash,
      overrideFields: assignment.source.overrideFields,
      prior: findPriorAssignment(model, assignment),
    })),
    warnings,
    errors,
    sourceSnapshotHash: stableHash({
      materials: model.materials || [],
      sections: model.sections || [],
      members: members.map((member) => ({ id: member.id, matId: member.matId, secId: member.secId, nonlinear: member.nonlinear })),
      reinforcementSnapshots: options.reinforcementSnapshots || {},
    }).slice(0, 24),
  };
  return deepFreeze({ ...core, contentHash: stableHash(core).slice(0, 24) });
}

export function applyHingeAssignmentChangeSet(model, changeSet, options = {}) {
  if (changeSet?.version !== HINGE_ASSIGNMENT_CHANGE_SET_VERSION || changeSet.status !== 'ready' || changeSet.errors?.length) {
    throw assignmentError('HINGE_ASSIGNMENT_CHANGE_SET_BLOCKED', 'A ready hinge assignment preview is required.');
  }
  const currentPreview = previewHingeAssignmentChangeSet(model, {
    ...options,
    id: changeSet.id,
    name: changeSet.name,
  });
  if (!options.allowRebuild && currentPreview.sourceSnapshotHash !== changeSet.sourceSnapshotHash) {
    throw assignmentError('HINGE_ASSIGNMENT_CHANGE_SET_STALE', 'Model property sources changed after hinge preview.');
  }
  const result = applyModelChangeSet(model, {
    id: changeSet.id,
    name: changeSet.name,
    changes: clone(changeSet.changes),
  }, options);
  if (!result.ok) {
    const error = assignmentError('HINGE_ASSIGNMENT_TRANSACTION_FAILED', 'Hinge assignment transaction failed.');
    error.errors = result.errors;
    throw error;
  }
  return deepFreeze({
    ...clone(changeSet),
    applied: true,
    model: result.model,
    transaction: result.transaction,
  });
}

export function hingeLocalDof(end, axis) {
  const endOffset = normalizeChoice(end, HINGE_ASSIGNMENT_ENDS, 'HINGE_ASSIGNMENT_END_INVALID') === 'i' ? 0 : 6;
  const axisOffset = normalizeChoice(axis, HINGE_ASSIGNMENT_AXES, 'HINGE_ASSIGNMENT_AXIS_INVALID') === 'y' ? 4 : 5;
  return endOffset + axisOffset;
}

function buildAutoHingeProperty(context, axis, options) {
  const rule = resolveAutoRule(context, axis, options);
  const inertia = positive(sectionValue(context.section, axis === 'y' ? ['Iy'] : ['Iz']), 'section inertia');
  const plasticModulus = positive(sectionValue(context.section, axis === 'y' ? ['Zy', 'Sy'] : ['Zz', 'Sz']), 'section plastic modulus');
  const strength = materialStrength(context.material, context.kind);
  const reinforcement = options.reinforcementSnapshots?.[context.member.id]
    || context.member.nonlinear?.reinforcementSnapshot
    || null;
  let yieldMoment;
  if (context.kind === 'concrete') {
    const capacity = reinforcement?.capacities?.[axis] ?? reinforcement?.[`M${axis}`] ?? reinforcement?.[`M${axis.toUpperCase()}`];
    if (!(Number(capacity) > 0)) {
      throw assignmentError(
        'HINGE_RC_REINFORCEMENT_SNAPSHOT_REQUIRED',
        `RC member ${context.member.id} requires an explicit reinforcement snapshot with ${axis}-axis capacity.`,
      );
    }
    yieldMoment = Number(capacity);
  } else yieldMoment = strength * plasticModulus;
  const memberRotationalStiffness = 4 * context.materialE * inertia / context.length;
  const initialStiffness = requiredRuleValue(rule.initialStiffnessRatio, 'initialStiffnessRatio') * memberRotationalStiffness;
  const thetaY = yieldMoment / initialStiffness;
  const hingeLength = rule.hingeLength != null
    ? requiredRuleValue(rule.hingeLength, 'hingeLength')
    : requiredRuleValue(rule.hingeLengthFactor, 'hingeLengthFactor') * sectionDepth(context.section, axis);
  const positiveFactors = normalizeBackboneFactors(rule.positive || rule);
  const negativeFactors = normalizeBackboneFactors(rule.negative || rule);
  const side = (factors) => [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: thetaY, moment: yieldMoment },
    { id: 'C', rotation: thetaY * factors.thetaC, moment: yieldMoment * factors.momentC },
    { id: 'D', rotation: thetaY * factors.thetaD, moment: yieldMoment * factors.momentD },
    { id: 'E', rotation: thetaY * factors.thetaE, moment: yieldMoment * factors.momentE },
  ];
  const sourceReference = clean(rule.source?.reference);
  const qualification = clean(rule.qualification)
    || (sourceReference && (context.kind !== 'concrete' || reinforcement?.source) ? 'candidate' : 'assumed');
  const propertyId = clean(rule.propertyId) || `HP:${context.member.id}:${axis}`;
  return createHingeProperty({
    id: propertyId,
    qualification,
    units: {
      rotation: 'rad',
      moment: clean(rule.units?.moment) || clean(options.units?.moment) || 'model-moment',
      length: clean(rule.units?.length) || clean(options.units?.length) || 'model-length',
    },
    parameters: {
      positive: side(positiveFactors),
      negative: side(negativeFactors),
      hingeLength,
      rotationDefinition: 'joint-relative-to-member-face-local-axis',
      hysteresis: rule.hysteresis || { rule: 'kinematic-masing' },
      degradation: rule.degradation || {},
      regularization: rule.regularization || {},
      integration: rule.integration || {},
      acceptance: rule.acceptance || [],
      pmm: rule.pmm || null,
    },
    source: {
      type: 'auto-member-snapshot',
      reference: sourceReference || null,
      edition: rule.source?.edition,
      clause: rule.source?.clause,
      assumption: sourceReference ? null : 'Auto capacity uses project material/section snapshots; deformation limits require project review.',
      materialSnapshot: context.material,
      sectionSnapshot: context.section,
      reinforcementSnapshot: reinforcement,
      generatedAt: clean(options.generatedAt) || null,
      generatedBy: HINGE_ASSIGNMENT_CHANGE_SET_VERSION,
      extra: {
        memberId: context.member.id,
        axis,
        role: context.member.analysis?.role || context.member.role || null,
        steelGrade: context.material.grade || context.material.name || null,
        sectionThickness: thicknessSnapshot(context.section),
        initialStiffness,
        memberRotationalStiffness,
      },
    },
    calibration: rule.calibration || {},
  });
}

function resolveAutoRule(context, axis, options) {
  const role = context.member.analysis?.role || context.member.role || 'default';
  const candidates = [
    options.rules?.members?.[context.member.id]?.[axis],
    options.rules?.roles?.[role]?.[axis],
    options.rules?.materials?.[context.kind]?.[axis],
    options.rules?.default?.[axis],
    options.rules?.default,
  ];
  const rule = candidates.find((item) => item && typeof item === 'object');
  if (!rule) {
    throw assignmentError('HINGE_AUTO_RULE_REQUIRED', `No auto hinge rule exists for ${context.member.id}:${axis}.`);
  }
  return rule;
}

function normalizeBackboneFactors(input) {
  const thetaC = requiredRuleValue(input.thetaC, 'thetaC');
  const thetaD = requiredRuleValue(input.thetaD, 'thetaD');
  const thetaE = requiredRuleValue(input.thetaE, 'thetaE');
  if (!(thetaC > 1 && thetaD > thetaC && thetaE > thetaD)) {
    throw assignmentError('HINGE_AUTO_ROTATION_FACTORS_INVALID', 'thetaC/thetaD/thetaE factors must strictly increase above one.');
  }
  return {
    thetaC,
    thetaD,
    thetaE,
    momentC: requiredRuleValue(input.momentC, 'momentC'),
    momentD: requiredRuleValue(input.momentD, 'momentD'),
    momentE: requiredRuleValue(input.momentE, 'momentE'),
  };
}

function memberContext(model, member) {
  let material;
  let section;
  try {
    material = materialOf(model, member.matId);
  } catch (error) {
    throw assignmentError('HINGE_AUTO_MATERIAL_NOT_FOUND', error.message || `Material ${member.matId} was not found.`);
  }
  try {
    section = sectionOf(model, member.secId);
  } catch (error) {
    throw assignmentError('HINGE_AUTO_SECTION_NOT_FOUND', error.message || `Section ${member.secId} was not found.`);
  }
  const nodeMap = new Map((model.nodes || []).map((row) => [row.id, row]));
  const a = nodeMap.get(member.n1);
  const b = nodeMap.get(member.n2);
  if (!a || !b) throw assignmentError('HINGE_AUTO_MEMBER_NODE_NOT_FOUND', `Member ${member.id} has a missing node.`);
  const length = Math.hypot(Number(b.x) - Number(a.x), Number(b.y) - Number(a.y), Number(b.z) - Number(a.z));
  if (!(length > 0)) throw assignmentError('HINGE_AUTO_MEMBER_LENGTH_INVALID', `Member ${member.id} has invalid length.`);
  return {
    member,
    material: clone(material),
    section: clone(section),
    length,
    materialE: positive(material.E ?? material.elastic?.E, 'material E'),
    kind: materialKind(material),
  };
}

function materialKind(material) {
  const text = `${material.kind || ''} ${material.type || ''} ${material.name || ''}`.toLowerCase();
  return text.includes('conc') || text.includes('rc') || text.includes('콘크리트') ? 'concrete' : 'steel';
}

function materialStrength(material, kind) {
  if (kind === 'concrete') return positive(material.fc ?? material.fck ?? material.Fy, 'concrete strength');
  return positive(material.Fy ?? material.fy ?? material.strength?.steel?.Fy, 'steel yield strength');
}

function sectionValue(section, keys) {
  const source = section.properties && typeof section.properties === 'object' ? { ...section, ...section.properties } : section;
  for (const key of keys) if (Number(source[key]) > 0) return Number(source[key]);
  return NaN;
}

function sectionDepth(section, axis) {
  const source = section.params && typeof section.params === 'object' ? { ...section, ...section.params } : section;
  return positive(axis === 'y' ? source.B ?? source.H : source.H ?? source.B, 'section depth');
}

function thicknessSnapshot(section) {
  const source = section.params && typeof section.params === 'object' ? { ...section, ...section.params } : section;
  return Object.fromEntries(['tw', 'tf', 't', 't1', 't2'].filter((key) => source[key] != null).map((key) => [key, Number(source[key])]));
}

function validateReleaseConflict(descriptor, assignment) {
  const dof = hingeLocalDof(assignment.end, assignment.axis);
  if ((descriptor.releases?.localDofs || []).includes(dof)) {
    throw assignmentError(
      'HINGE_RELEASE_AXIS_CONFLICT',
      `Element ${descriptor.id} has both a release and hinge at ${assignment.end}-${assignment.axis}.`,
    );
  }
}

function resolveAxialRatio(assignment, descriptor, options) {
  if (!assignment.propertyId || !assignment) return null;
  if (assignment.axialRatio != null) return assignment.axialRatio;
  const source = options.axialRatios;
  if (source instanceof Map) return source.get(descriptor.id) ?? 0;
  if (source && typeof source === 'object') return source[descriptor.id] ?? 0;
  return 0;
}

function resolvePmmInteraction(source, memberId, axis) {
  if (source == null) return null;
  const memberAxisKey = `${memberId}:${axis}`;
  const value = source instanceof Map
    ? source.get(memberAxisKey) ?? source.get(memberId)
    : source[memberAxisKey] ?? source[memberId];
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw assignmentError('HINGE_PMM_INTERACTION_INVALID', `PMM interaction ${memberAxisKey} must be an object.`);
  }
  return clone(value);
}

function normalizeAssignmentSource(input) {
  return deepFreeze({
    mode: clean(input.mode) || 'user',
    generator: clean(input.generator) || null,
    propertyHash: clean(input.propertyHash) || null,
    assumption: clean(input.assumption) || null,
    overrideFields: Array.isArray(input.overrideFields) ? [...new Set(input.overrideFields.map(String))].sort() : [],
  });
}

function normalizeChoices(values, allowed, code) {
  return [...new Set(values.map((value) => normalizeChoice(value, allowed, code)))];
}

function normalizeChoice(value, allowed, code) {
  const normalized = clean(value).toLowerCase();
  if (!allowed.includes(normalized)) throw assignmentError(code, `Unsupported value ${value || '(missing)'}.`);
  return normalized;
}

function deduplicatePropertyChanges(changes) {
  const seen = new Set();
  return changes.filter((change) => {
    if (change.collection !== 'hingeProperties') return true;
    const key = `${change.collection}:${change.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueById(rows) {
  return [...new Map(rows.map((row) => [row.id, row])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

function propertyIdConflicts(rows) {
  const hashesById = new Map();
  for (const row of rows) {
    if (!hashesById.has(row.id)) hashesById.set(row.id, new Set());
    hashesById.get(row.id).add(row.contentHash);
  }
  return [...hashesById.entries()]
    .filter(([, hashes]) => hashes.size > 1)
    .map(([id, hashes]) => ({ id, hashes: [...hashes].sort() }));
}

function findPriorAssignment(model, assignment) {
  const member = (model.members || []).find((row) => row.id === assignment.memberId);
  const prior = (member?.nonlinear?.hinges || []).find((row) => row.end === assignment.end && row.axis === assignment.axis);
  return clone(prior || null);
}

function assignmentSort(a, b) {
  return `${a.memberId || ''}:${a.end}:${a.axis}:${a.id}`.localeCompare(`${b.memberId || ''}:${b.end}:${b.axis}:${b.id}`);
}

function leafPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.keys(value).sort().flatMap((key) => leafPaths(value[key], prefix ? `${prefix}.${key}` : key));
}

function deepMerge(base, patch) {
  if (!record(base) || !record(patch)) return clone(patch);
  const output = clone(base);
  for (const [key, value] of Object.entries(patch)) {
    output[key] = record(value) && record(output[key]) ? deepMerge(output[key], value) : clone(value);
  }
  return output;
}

function issue(code, target, message) {
  return { code, target, message };
}

function requiredRuleValue(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw assignmentError('HINGE_AUTO_RULE_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function positive(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw assignmentError('HINGE_AUTO_SOURCE_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw assignmentError('HINGE_ASSIGNMENT_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function requiredId(value, label) {
  const id = clean(value);
  if (!id) throw assignmentError('HINGE_ASSIGNMENT_ID_REQUIRED', `${label} ID is required.`);
  return id;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assignmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
