import { stableHash, stableStringify } from '../../core/stableHash.js';
import { resolveGlobalShearDeformation, resolveMemberShearDeformationSetting } from '../../core/shearDeformation.js';
import { resolveSectionShearAreas } from '../../materials/sectionProperties.js';
import { normalizeSectionRecord } from '../../materials/sectionSchema.js';

export const DOMAIN_BINARY_VERSION = 'p10-domain-binary-v3';
export const DOMAIN_BINARY_ENDIANNESS = detectEndianness();

const MEMBER_ROTATIONAL_SPRING_COMPONENTS = Object.freeze(['ryI', 'rzI', 'ryJ', 'rzJ']);
const MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT = Object.freeze({
  encoding: 'presence-bitmask',
  bits: Object.freeze({ ryI: 0, rzI: 1, ryJ: 2, rzJ: 3 }),
  absent: 'rigid',
  presentZero: 'release',
});

export function packDomainBinary(model = {}) {
  const nodes = array(model.nodes);
  const members = array(model.members);
  const materials = array(model.materials);
  const sections = array(model.sections);
  const loads = array(model.loads);
  const loadCases = array(model.loadCases);
  const combinations = array(model.loadCombinations);
  const nodeIds = uniqueIds(nodes, 'node');
  const memberIds = uniqueIds(members, 'member');
  const materialIds = dictionaryIds(materials, members.map((row) => row.matId), 'material');
  const sectionIds = dictionaryIds(sections, members.map((row) => row.secId), 'section');
  const loadCaseIds = dictionaryIds(loadCases, loads.map((row) => row.case), 'load case');
  const loadIds = loads.map((row, index) => text(row.id) || 'L' + (index + 1));
  const combinationIds = combinations.map((row, index) => text(row.id) || 'C' + (index + 1));
  const memberTypeIds = [...new Set(members.map((row) => text(row.type) || 'frame'))].sort();
  const nodeIndex = indexMap(nodeIds);
  const materialIndex = indexMap(materialIds);
  const sectionIndex = indexMap(sectionIds);
  const loadCaseIndex = indexMap(loadCaseIds);
  const memberTypeIndex = indexMap(memberTypeIds);

  const coordinates = new Float64Array(nodes.length * 3);
  const dofMap = new Int32Array(nodes.length * 6);
  let activeDof = 0;
  nodes.forEach((node, index) => {
    coordinates.set([
      finite(node.x, 'node.x'),
      finite(node.y, 'node.y'),
      finite(node.z, 'node.z'),
    ], index * 3);
    const fixed = fixedDofs(node);
    for (let component = 0; component < 6; component += 1) {
      dofMap[index * 6 + component] = fixed[component] ? -1 : activeDof++;
    }
  });

  const connectivity = new Int32Array(members.length * 2);
  const memberType = new Uint16Array(members.length);
  const memberMaterial = new Int32Array(members.length);
  const memberSection = new Int32Array(members.length);
  const memberRoll = new Float64Array(members.length);
  const memberOffsets = new Float64Array(members.length * 6);
  const memberReleaseCodes = new Uint8Array(members.length * 2);
  const memberRotationalSprings = new Float64Array(members.length * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length);
  const memberRotationalSpringMask = new Uint8Array(members.length);
  const globalShearDeformation = resolveGlobalShearDeformation(model);
  const analysisFlags = new Uint8Array([globalShearDeformation.enabled ? 1 : 0]);
  const memberShearDeformation = new Uint8Array(members.length);
  members.forEach((member, index) => {
    connectivity[index * 2] = requiredIndex(nodeIndex, member.n1, 'member.n1');
    connectivity[index * 2 + 1] = requiredIndex(nodeIndex, member.n2, 'member.n2');
    memberType[index] = memberTypeIndex.get(text(member.type) || 'frame');
    memberMaterial[index] = requiredIndex(materialIndex, member.matId, 'member.matId');
    memberSection[index] = requiredIndex(sectionIndex, member.secId, 'member.secId');
    memberRoll[index] = numberOr(member.localAxis?.roll, 0);
    memberOffsets.set(offsetValues(member), index * 6);
    memberReleaseCodes[index * 2] = releaseCode(member.releases?.i);
    memberReleaseCodes[index * 2 + 1] = releaseCode(member.releases?.j);
    const rotationalSprings = packMemberRotationalSprings(member);
    memberRotationalSprings.set(rotationalSprings.values, index * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length);
    memberRotationalSpringMask[index] = rotationalSprings.mask;
    const behavior = member.behavior || member.type || 'frame';
    const shearApplicable = !['truss', 'tensionOnly', 'compressionOnly'].includes(behavior);
    memberShearDeformation[index] = shearApplicable
      && resolveMemberShearDeformationSetting(model, member).requested ? 1 : 0;
  });

  const materialProperties = new Float64Array(materialIds.length * 5);
  materialIds.forEach((id, index) => {
    const row = materials.find((item) => item.id === id) || {};
    materialProperties.set([
      numberOr(row.E ?? row.elastic?.E, 0),
      numberOr(row.G ?? row.elastic?.G, 0),
      numberOr(row.Fy ?? row.strength?.steel?.Fy, 0),
      numberOr(row.Fu ?? row.strength?.steel?.Fu, 0),
      numberOr(row.density ?? row.rho ?? row.elastic?.rho, 0),
    ], index * 5);
  });
  const sectionProperties = new Float64Array(sectionIds.length * 4);
  const sectionShearAreas = new Float64Array(sectionIds.length * 2);
  sectionIds.forEach((id, index) => {
    const row = sections.find((item) => item.id === id) || {};
    const normalized = normalizeSectionRecord(row);
    const properties = normalized.properties && typeof normalized.properties === 'object'
      ? normalized.properties
      : {};
    const effective = { ...row, ...normalized, ...properties };
    const shearAreas = resolveSectionShearAreas(effective);
    sectionProperties.set([
      numberOr(effective.A, 0),
      numberOr(effective.Iy, 0),
      numberOr(effective.Iz, 0),
      numberOr(effective.J, 0),
    ], index * 4);
    sectionShearAreas.set([
      positiveOr(shearAreas.Ay, 0),
      positiveOr(shearAreas.Az, 0),
    ], index * 2);
  });

  const loadCase = new Int32Array(loads.length);
  const loadTargetKind = new Uint8Array(loads.length);
  const loadTargetIndex = new Int32Array(loads.length);
  const loadDirection = new Int8Array(loads.length);
  const loadValues = new Float64Array(loads.length * 6);
  const memberIndex = indexMap(memberIds);
  loads.forEach((load, index) => {
    loadCase[index] = requiredIndex(loadCaseIndex, load.case, 'load.case');
    const nodal = load.node != null;
    loadTargetKind[index] = nodal ? 1 : load.member != null ? 2 : 0;
    loadTargetIndex[index] = nodal
      ? requiredIndex(nodeIndex, load.node, 'load.node')
      : load.member != null ? requiredIndex(memberIndex, load.member, 'load.member') : -1;
    loadDirection[index] = directionCode(load.dir);
    loadValues.set([
      numberOr(load.P, 0),
      numberOr(load.w, 0),
      numberOr(load.M, 0),
      numberOr(load.position ?? load.x, 0),
      numberOr(load.a, 0),
      numberOr(load.b, 0),
    ], index * 6);
  });

  const combinationFactors = new Float64Array(combinations.length * loadCaseIds.length);
  combinations.forEach((combination, row) => {
    loadCaseIds.forEach((caseId, column) => {
      combinationFactors[row * loadCaseIds.length + column] = numberOr(combination.factors?.[caseId], 0);
    });
  });
  const modelPayload = new TextEncoder().encode(stableStringify(model));

  const dictionaries = {
    nodeIds,
    memberIds,
    materialIds,
    sectionIds,
    loadIds,
    loadCaseIds,
    combinationIds,
    memberTypeIds,
  };
  const buffers = {
    coordinates,
    dofMap,
    connectivity,
    memberType,
    memberMaterial,
    memberSection,
    memberRoll,
    memberOffsets,
    memberReleaseCodes,
    memberRotationalSprings,
    memberRotationalSpringMask,
    analysisFlags,
    memberShearDeformation,
    materialProperties,
    sectionProperties,
    sectionShearAreas,
    loadCase,
    loadTargetKind,
    loadTargetIndex,
    loadDirection,
    loadValues,
    combinationFactors,
    modelPayload,
  };
  const metadata = {
    version: DOMAIN_BINARY_VERSION,
    endianness: DOMAIN_BINARY_ENDIANNESS,
    units: canonicalUnits(model),
    schemaVersion: model.schemaVersion ?? null,
    payloadEncoding: 'utf8-stable-json',
    bufferLayouts: {
      analysisFlags: ['shearDeformation'],
      memberShearDeformation: 'effective-requested-boolean',
      memberReleaseCodes: ['i', 'j'],
      memberRotationalSprings: [...MEMBER_ROTATIONAL_SPRING_COMPONENTS],
      memberRotationalSpringMask: MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT,
      sectionShearAreas: ['Ay', 'Az'],
    },
    counts: {
      nodes: nodes.length,
      activeDof,
      members: members.length,
      materials: materialIds.length,
      sections: sectionIds.length,
      loads: loads.length,
      loadCases: loadCaseIds.length,
      combinations: combinations.length,
    },
    dictionaryHash: stableHash(dictionaries),
    sourceHash: stableHash(model),
  };
  const byteLength = Object.values(buffers).reduce((sum, value) => sum + value.byteLength, 0);
  const domainHash = hashDomain(metadata, dictionaries, buffers, byteLength);
  return Object.freeze({
    version: DOMAIN_BINARY_VERSION,
    metadata: Object.freeze(metadata),
    dictionaries: deepFreeze(dictionaries),
    buffers: Object.freeze(buffers),
    byteLength,
    domainHash,
  });
}

export function validateDomainBinary(domain) {
  const errors = [];
  if (!domain || typeof domain !== 'object') return { ok: false, errors: ['domain:not-object'] };
  if (domain.version !== DOMAIN_BINARY_VERSION) errors.push('domain:version');
  if (domain.metadata?.version !== DOMAIN_BINARY_VERSION) errors.push('domain:metadata-version');
  if (domain.metadata?.endianness !== DOMAIN_BINARY_ENDIANNESS) errors.push('domain:endianness');
  const buffers = domain.buffers && typeof domain.buffers === 'object' ? domain.buffers : {};
  const byteLength = Object.values(buffers).reduce((sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0), 0);
  if (byteLength !== domain.byteLength) errors.push('domain:byteLength');
  if (!ArrayBuffer.isView(buffers.coordinates) || !ArrayBuffer.isView(buffers.dofMap)) errors.push('domain:node-buffers');
  if (!ArrayBuffer.isView(buffers.connectivity) || !ArrayBuffer.isView(buffers.memberType)) errors.push('domain:member-buffers');
  if (domain.metadata?.counts?.nodes * 3 !== buffers.coordinates?.length) errors.push('domain:node-count');
  if (domain.metadata?.counts?.members * 2 !== buffers.connectivity?.length) errors.push('domain:member-count');
  if (!(buffers.memberReleaseCodes instanceof Uint8Array)
    || domain.metadata?.counts?.members * 2 !== buffers.memberReleaseCodes.length
    || [...buffers.memberReleaseCodes].some((value) => value > 2)) errors.push('domain:member-release-codes');
  const rotationalSpringsValid = buffers.memberRotationalSprings instanceof Float64Array
    && domain.metadata?.counts?.members * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length === buffers.memberRotationalSprings.length;
  const rotationalSpringMaskValid = buffers.memberRotationalSpringMask instanceof Uint8Array
    && domain.metadata?.counts?.members === buffers.memberRotationalSpringMask.length
    && [...buffers.memberRotationalSpringMask].every((value) => (value & 0xf0) === 0);
  if (!rotationalSpringsValid) errors.push('domain:member-rotational-springs');
  if (!rotationalSpringMaskValid) errors.push('domain:member-rotational-spring-mask');
  if (rotationalSpringsValid && rotationalSpringMaskValid
    && !validMemberRotationalSpringValues(buffers.memberRotationalSprings, buffers.memberRotationalSpringMask)) {
    errors.push('domain:member-rotational-spring-values');
  }
  if (!validMemberRotationalSpringLayout(domain.metadata?.bufferLayouts)) {
    errors.push('domain:member-rotational-spring-layout');
  }
  if (!(buffers.analysisFlags instanceof Uint8Array) || buffers.analysisFlags.length !== 1) errors.push('domain:analysis-flags');
  if (!(buffers.memberShearDeformation instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberShearDeformation.length) errors.push('domain:member-shear-deformation');
  if (!(buffers.sectionShearAreas instanceof Float64Array)
    || domain.metadata?.counts?.sections * 2 !== buffers.sectionShearAreas.length) errors.push('domain:section-shear-areas');
  if (domain.domainHash !== hashDomain(domain.metadata, domain.dictionaries, buffers, byteLength)) errors.push('domain:hash');
  return { ok: errors.length === 0, errors };
}

export function unpackDomainBinary(domain) {
  const validation = validateDomainBinary(domain);
  if (!validation.ok) throw contractError('DOMAIN_BINARY_INVALID', validation.errors.join(', '));
  const { dictionaries, buffers } = domain;
  const nodes = dictionaries.nodeIds.map((id, index) => ({
    id,
    x: buffers.coordinates[index * 3],
    y: buffers.coordinates[index * 3 + 1],
    z: buffers.coordinates[index * 3 + 2],
    dof: Array.from(buffers.dofMap.slice(index * 6, index * 6 + 6)),
  }));
  const members = dictionaries.memberIds.map((id, index) => {
    const releases = {
      i: releaseValue(buffers.memberReleaseCodes[index * 2]),
      j: releaseValue(buffers.memberReleaseCodes[index * 2 + 1]),
    };
    const spring = unpackMemberRotationalSprings(buffers, index);
    if (spring) releases.spring = spring;
    return {
      id,
      n1: dictionaries.nodeIds[buffers.connectivity[index * 2]],
      n2: dictionaries.nodeIds[buffers.connectivity[index * 2 + 1]],
      type: dictionaries.memberTypeIds[buffers.memberType[index]],
      matId: dictionaries.materialIds[buffers.memberMaterial[index]],
      secId: dictionaries.sectionIds[buffers.memberSection[index]],
      releases,
    };
  });
  return {
    version: domain.version,
    units: { ...domain.metadata.units },
    nodes,
    members,
    sourceHash: domain.metadata.sourceHash,
    domainHash: domain.domainHash,
    model: JSON.parse(new TextDecoder().decode(buffers.modelPayload)),
  };
}

export function domainBinaryTransferables(domain) {
  const validation = validateDomainBinary(domain);
  if (!validation.ok) throw contractError('DOMAIN_BINARY_INVALID', validation.errors.join(', '));
  return [...new Set(Object.values(domain.buffers).map((value) => value.buffer))];
}

function hashDomain(metadata, dictionaries, buffers, byteLength) {
  return stableHash({
    metadata,
    dictionaries,
    byteLength,
    buffers: Object.fromEntries(Object.entries(buffers).map(([key, value]) => [key, Array.from(value)])),
  });
}

function fixedDofs(node) {
  if (node.support === 'fixed') return [true, true, true, true, true, true];
  if (node.support === 'pin' || node.support === 'pinned') return [true, true, true, false, false, false];
  if (Array.isArray(node.fix)) return Array.from({ length: 6 }, (_item, index) => node.fix[index] === true);
  return [false, false, false, false, false, false];
}

function offsetValues(member) {
  const i = member.offset?.i || member.offsetI || {};
  const j = member.offset?.j || member.offsetJ || {};
  return [numberOr(i.x, 0), numberOr(i.y, 0), numberOr(i.z, 0), numberOr(j.x, 0), numberOr(j.y, 0), numberOr(j.z, 0)];
}

function releaseCode(value) {
  const normalized = String(value || 'rigid').toLowerCase();
  if (normalized === 'pin' || normalized === 'pinned') return 1;
  if (normalized === 'custom') return 2;
  return 0;
}

function releaseValue(code) {
  if (code === 1) return 'pin';
  if (code === 2) return 'custom';
  return 'rigid';
}

function packMemberRotationalSprings(member = {}) {
  const releases = member.releases;
  if (!releases || typeof releases !== 'object'
    || !Object.prototype.hasOwnProperty.call(releases, 'spring')) {
    return { values: [0, 0, 0, 0], mask: 0 };
  }
  const spring = releases.spring;
  if (!spring || typeof spring !== 'object' || Array.isArray(spring)) {
    throw contractError('DOMAIN_ROTATIONAL_SPRING_INVALID', `member ${text(member.id) || '?'} releases.spring must be an object.`);
  }
  const unknown = Object.keys(spring).filter((key) => !MEMBER_ROTATIONAL_SPRING_COMPONENTS.includes(key));
  if (unknown.length > 0) {
    throw contractError(
      'DOMAIN_ROTATIONAL_SPRING_INVALID',
      `member ${text(member.id) || '?'} releases.spring contains unsupported component ${unknown[0]}.`,
    );
  }
  const values = [0, 0, 0, 0];
  let mask = 0;
  MEMBER_ROTATIONAL_SPRING_COMPONENTS.forEach((component, componentIndex) => {
    if (!Object.prototype.hasOwnProperty.call(spring, component)) return;
    const value = spring[component];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw contractError(
        'DOMAIN_ROTATIONAL_SPRING_INVALID',
        `member ${text(member.id) || '?'} releases.spring.${component} must be a finite nonnegative number.`,
      );
    }
    values[componentIndex] = value;
    mask |= 1 << componentIndex;
  });
  return { values, mask };
}

function unpackMemberRotationalSprings(buffers, memberIndex) {
  const mask = buffers.memberRotationalSpringMask[memberIndex];
  if (mask === 0) return null;
  const spring = {};
  MEMBER_ROTATIONAL_SPRING_COMPONENTS.forEach((component, componentIndex) => {
    if ((mask & (1 << componentIndex)) === 0) return;
    spring[component] = buffers.memberRotationalSprings[
      memberIndex * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length + componentIndex
    ];
  });
  return spring;
}

function validMemberRotationalSpringValues(values, masks) {
  for (let memberIndex = 0; memberIndex < masks.length; memberIndex += 1) {
    for (let componentIndex = 0; componentIndex < MEMBER_ROTATIONAL_SPRING_COMPONENTS.length; componentIndex += 1) {
      const value = values[memberIndex * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length + componentIndex];
      const present = (masks[memberIndex] & (1 << componentIndex)) !== 0;
      if (!Number.isFinite(value) || value < 0 || (!present && value !== 0)) return false;
    }
  }
  return true;
}

function validMemberRotationalSpringLayout(layouts) {
  const releaseCodes = layouts?.memberReleaseCodes;
  const components = layouts?.memberRotationalSprings;
  const mask = layouts?.memberRotationalSpringMask;
  return Array.isArray(releaseCodes)
    && releaseCodes.length === 2
    && releaseCodes[0] === 'i'
    && releaseCodes[1] === 'j'
    && Array.isArray(components)
    && components.length === MEMBER_ROTATIONAL_SPRING_COMPONENTS.length
    && components.every((component, index) => component === MEMBER_ROTATIONAL_SPRING_COMPONENTS[index])
    && mask?.encoding === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.encoding
    && mask?.absent === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.absent
    && mask?.presentZero === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.presentZero
    && MEMBER_ROTATIONAL_SPRING_COMPONENTS.every(
      (component) => mask?.bits?.[component] === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.bits[component],
    );
}

function directionCode(value) {
  return ({ '+x': 1, '-x': -1, '+y': 2, '-y': -2, '+z': 3, '-z': -3 })[String(value || '').toLowerCase()] || 0;
}

function canonicalUnits(model) {
  const source = model.unitSystem?.internal || model.units || {};
  return {
    length: source.length || 'm',
    force: source.force || 'kN',
    moment: source.moment || 'kN.m',
  };
}

function dictionaryIds(records, referenced, label) {
  const ids = records.map((row) => text(row.id)).filter(Boolean);
  for (const value of referenced) if (text(value) && !ids.includes(String(value))) ids.push(String(value));
  if (new Set(ids).size !== ids.length) throw contractError('DOMAIN_ID_DUPLICATE', 'Duplicate ' + label + ' ID.');
  return ids;
}

function uniqueIds(records, label) {
  const ids = records.map((row) => text(row.id));
  if (ids.some((id) => !id)) throw contractError('DOMAIN_ID_REQUIRED', label + ' ID is required.');
  if (new Set(ids).size !== ids.length) throw contractError('DOMAIN_ID_DUPLICATE', 'Duplicate ' + label + ' ID.');
  return ids;
}

function indexMap(ids) {
  return new Map(ids.map((id, index) => [id, index]));
}

function requiredIndex(map, value, field) {
  const index = map.get(String(value ?? ''));
  if (!Number.isInteger(index)) throw contractError('DOMAIN_REFERENCE_INVALID', field + ' references an unknown ID.');
  return index;
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw contractError('DOMAIN_NONFINITE', field + ' must be finite.');
  return number;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function contractError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function detectEndianness() {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setUint16(0, 0x00ff, true);
  return new Uint16Array(buffer)[0] === 0x00ff ? 'LE' : 'BE';
}
