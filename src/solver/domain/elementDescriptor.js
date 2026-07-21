import { materialOf, sectionOf } from '../../core/catalogs.js';
import { stableHash } from '../../core/stableHash.js';
import { memberReleaseDofs } from '../linear3dElement.js';
import { memberKinematics } from '../linear3dAssembly.js';
import { effectiveSectionMaterial } from '../linear3dPost.js';
import { resolveMemberTimoshenko } from '../timoshenko.js';

export const CANONICAL_ELEMENT_DESCRIPTOR_VERSION = 'p8-m1-element-descriptor-v1';

export function buildElementDescriptors(model = {}, nodes = model.nodes || [], members = model.members || []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const wallByMember = new Map((model.wallEquivalents || []).map((row) => [row.memberId, row]));
  const materialCache = new Map();
  const sectionCache = new Map();
  const getMaterial = (id) => cachedCatalogValue(materialCache, id, () => materialOf(model, id));
  const getSection = (id) => cachedCatalogValue(sectionCache, id, () => sectionOf(model, id));
  const descriptors = [];
  const errors = [];
  for (const member of members) {
    const a = nodeMap.get(member.n1);
    const b = nodeMap.get(member.n2);
    if (!a || !b) {
      errors.push(issue('ELEMENT_NODE_REFERENCE_INVALID', member.id, 'Element references a missing node.'));
      continue;
    }
    const kinematics = memberKinematics(member, a, b);
    if (!kinematics.ok) {
      errors.push(issue(kinematics.reason || 'ELEMENT_KINEMATICS_INVALID', member.id, kinematics.message));
      continue;
    }
    const materialSource = getMaterial(member.matId);
    const sectionSource = getSection(member.secId);
    const effective = effectiveSectionMaterial(
      getSection,
      getMaterial,
      member,
    );
    const i = nodeIndex.get(member.n1) * 6;
    const j = nodeIndex.get(member.n2) * 6;
    const timoshenko = resolveMemberTimoshenko(
      model,
      member,
      effective.section,
      effective.material,
      kinematics.ax.L,
    );
    const descriptor = {
      version: CANONICAL_ELEMENT_DESCRIPTOR_VERSION,
      id: member.id,
      type: member.type || 'frame',
      behavior: member.behavior || member.type || 'frame',
      nodeIds: [member.n1, member.n2],
      fullDofs: [i, i + 1, i + 2, i + 3, i + 4, i + 5, j, j + 1, j + 2, j + 3, j + 4, j + 5],
      geometry: {
        length: kinematics.ax.L,
        grossLength: kinematics.ax.grossL || kinematics.ax.L,
        axes: { x: [...kinematics.ax.x], y: [...kinematics.ax.y], z: [...kinematics.ax.z] },
        transform: clone(kinematics.T),
        localAxis: clone(member.localAxis || { roll: 0, strongAxis: 'z' }),
        offsets: clone(kinematics.ax.offset || { i: 0, j: 0, rigidFactor: 1 }),
      },
      releases: {
        contract: clone(member.releases || null),
        localDofs: memberReleaseDofs(member),
      },
      propertyRefs: {
        materialId: materialSource.id || member.matId || null,
        sectionId: sectionSource.id || member.secId || null,
        materialVersion: materialSource.version ?? 1,
        sectionVersion: sectionSource.version ?? 1,
      },
      propertySnapshot: {
        material: materialSnapshot(materialSource),
        section: sectionSnapshot(sectionSource),
        effectiveMaterial: materialSnapshot(effective.material),
        effectiveSection: sectionSnapshot(effective.section),
        modifiers: clone(member.modifiers || null),
      },
      formulation: {
        family: 'frame-3d',
        bending: timoshenko.formulation,
        shearDeformation: clone(timoshenko),
      },
      nonlinear: clone(member.nonlinear || null),
      generated: member.generated === true,
      massless: member.massless === true || member.generated === true,
      origin: originOf(member, wallByMember),
    };
    descriptor.propertyHash = stableHash({
      propertySnapshot: descriptor.propertySnapshot,
      formulation: descriptor.formulation,
    }).slice(0, 24);
    descriptor.descriptorHash = stableHash(descriptor).slice(0, 24);
    descriptors.push(descriptor);
  }
  descriptors.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  errors.sort((a, b) => `${a.code}:${a.elementId}`.localeCompare(`${b.code}:${b.elementId}`));
  return { version: CANONICAL_ELEMENT_DESCRIPTOR_VERSION, ok: errors.length === 0, descriptors, errors };
}

function cachedCatalogValue(cache, id, resolve) {
  if (!cache.has(id)) cache.set(id, resolve());
  return cache.get(id);
}

function originOf(member = {}, wallByMember = new Map()) {
  const wall = wallByMember.get(member.id);
  if (wall) return { type: 'wall', id: wall.wallId, formulation: 'mid-pier-equivalent', qualification: 'preliminary-equivalent' };
  if (!member.generated) return { type: 'member', id: member.id || null };
  if (member.diaphragmId) return { type: 'diaphragm', id: member.diaphragmId, formulation: member.source || 'semiRigidDiaphragm' };
  if (member.shellId) return { type: 'shell', id: member.shellId, formulation: member.source || 'shellFrameAssembly' };
  return { type: 'generated', id: member.originId || member.id || null, formulation: member.source || null };
}

function issue(code, elementId, message) {
  return { code, elementId: elementId || null, message: message || code };
}

function materialSnapshot(material = {}) {
  return pick(material, ['id', 'version', 'name', 'type', 'E', 'G', 'nu', 'density', 'rho', 'alpha', 'Fy', 'Fu', 'fy', 'source']);
}

function sectionSnapshot(section = {}) {
  const source = section.properties && typeof section.properties === 'object'
    ? { ...section, ...section.properties }
    : section;
  return pick(source, ['id', 'version', 'name', 'kind', 'shape', 'type', 'A', 'Ay', 'Az', 'Iy', 'Iz', 'J', 'Cw', 'H', 'B', 'Zy', 'Zz', 'Sy', 'Sz', 'source']);
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source?.[key] != null).map((key) => [key, clone(source[key])]));
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
