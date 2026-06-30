import { normalizeStories } from '../core/storyModel.js';

export const INDEX_AGENT_ACTIONS_VERSION = 'm12-agent-modeling-productivity';

export const MODELING_ACTIONS = [
  'selectEntity',
  'clearSelection',
  'addNode',
  'updateNode',
  'deleteNode',
  'setSupport',
  'setNodeMass',
  'addMember',
  'updateMember',
  'deleteMember',
  'setMemberSection',
  'setMemberMaterial',
  'assignSection',
  'addLoad',
  'updateLoad',
  'deleteLoad',
  'addLoadCase',
  'updateLoadCase',
  'addLoadCombination',
  'updateLoadCombination',
  'createGridFrame',
  'copyStory',
  'autoAssignMemberRoles',
  'applyLoadTemplate',
  'generateFloorMass',
];

export function ensureAgentState(target) {
  target.__SStructuresAgentState ||= {
    version: INDEX_AGENT_ACTIONS_VERSION,
    selection: { type: null, id: null },
    lastAction: null,
  };
  return target.__SStructuresAgentState;
}

export function executeModelingAction(model, state, action, payload = {}) {
  ensureCollections(model);
  const result = executeModelingActionCore(model, state, action, payload);
  if (result.changed) refreshStories(model);
  return result;
}

function executeModelingActionCore(model, state, action, payload) {
  switch (action) {
    case 'selectEntity':
      return selectEntity(model, state, payload);
    case 'clearSelection':
      state.selection = { type: null, id: null };
      return { changed: false, selection: state.selection };
    case 'addNode':
      return addNode(model, state, payload);
    case 'updateNode':
      return updateNode(model, state, payload);
    case 'deleteNode':
      return deleteNode(model, state, payload);
    case 'setSupport':
      return setSupport(model, state, payload);
    case 'setNodeMass':
      return setNodeMass(model, state, payload);
    case 'addMember':
      return addMember(model, state, payload);
    case 'updateMember':
      return updateMember(model, state, payload);
    case 'deleteMember':
      return deleteMember(model, state, payload);
    case 'setMemberSection':
      return updateMember(model, state, { id: payload.memberId || payload.id, secId: payload.secId });
    case 'setMemberMaterial':
      return updateMember(model, state, { id: payload.memberId || payload.id, matId: payload.matId });
    case 'assignSection':
      return assignSection(model, state, payload);
    case 'addLoad':
      return addLoad(model, state, payload);
    case 'updateLoad':
      return updateLoad(model, state, payload);
    case 'deleteLoad':
      return deleteLoad(model, state, payload);
    case 'addLoadCase':
      return addLoadCase(model, state, payload);
    case 'updateLoadCase':
      return updateLoadCase(model, state, payload);
    case 'addLoadCombination':
      return addLoadCombination(model, state, payload);
    case 'updateLoadCombination':
      return updateLoadCombination(model, state, payload);
    case 'createGridFrame':
      return createGridFrame(model, state, payload);
    case 'copyStory':
      return copyStory(model, state, payload);
    case 'autoAssignMemberRoles':
      return autoAssignMemberRoles(model, state, payload);
    case 'applyLoadTemplate':
      return applyLoadTemplate(model, state, payload);
    case 'generateFloorMass':
      return generateFloorMass(model, state, payload);
    default:
      throw new Error(`Unsupported modeling action: ${action}`);
  }
}

export function summarizeAgentModelState(model, state) {
  ensureCollections(model);
  return {
    selection: summarizeSelection(model, state?.selection),
    entities: {
      nodeIds: model.nodes.map((node) => node.id),
      memberIds: model.members.map((member) => member.id),
      loadIds: model.loads.map((load) => load.id),
      loadCaseIds: model.loadCases.map((loadCase) => loadCase.id),
      combinationIds: model.loadCombinations.map((combo) => combo.id),
      sectionIds: model.sections.map((section) => section.id),
      materialIds: model.materials.map((material) => material.id),
    },
  };
}

export function summarizeSelection(model, selection = { type: null, id: null }) {
  if (!selection?.type || !selection?.id) return { type: null, id: null, exists: false };
  const entity = findEntity(model, selection.type, selection.id);
  if (!entity) return { ...selection, exists: false };
  const summary = { type: selection.type, id: selection.id, exists: true };
  if (selection.type === 'node') {
    summary.connectedMemberIds = model.members
      .filter((member) => member.n1 === selection.id || member.n2 === selection.id)
      .map((member) => member.id);
    summary.loadIds = model.loads.filter((load) => load.node === selection.id).map((load) => load.id);
  }
  if (selection.type === 'member') {
    summary.nodeIds = [entity.n1, entity.n2];
    summary.loadIds = model.loads.filter((load) => load.member === selection.id).map((load) => load.id);
  }
  return summary;
}

function selectEntity(model, state, payload) {
  const type = requiredString(payload.type, 'type');
  const id = requiredString(payload.id, 'id');
  if (!['node', 'member', 'load', 'loadCase', 'loadCombination'].includes(type)) {
    throw new Error(`Unsupported selection type: ${type}`);
  }
  if (!findEntity(model, type, id)) throw new Error(`Cannot select missing ${type}: ${id}`);
  state.selection = { type, id };
  return { changed: false, selection: summarizeSelection(model, state.selection) };
}

function addNode(model, state, payload) {
  const node = {
    id: uniqueId(model.nodes, payload.id, 'N'),
    x: finite(payload.x, 0),
    y: finite(payload.y, 0),
    z: finite(payload.z, 0),
    support: normalizeSupport(payload.support),
  };
  if (payload.fix) node.fix = normalizeFix(payload.fix);
  if (payload.mass != null) node.mass = normalizeMass(payload.mass);
  model.nodes.push(node);
  state.selection = { type: 'node', id: node.id };
  return { changed: true, node, selection: summarizeSelection(model, state.selection) };
}

function updateNode(model, state, payload) {
  const node = getById(model.nodes, requiredString(payload.id || payload.nodeId, 'id'), 'node');
  if (payload.x != null) node.x = finite(payload.x, node.x);
  if (payload.y != null) node.y = finite(payload.y, node.y);
  if (payload.z != null) node.z = finite(payload.z, node.z || 0);
  if ('support' in payload) node.support = normalizeSupport(payload.support);
  if ('fix' in payload) node.fix = payload.fix == null ? undefined : normalizeFix(payload.fix);
  if ('mass' in payload) node.mass = payload.mass == null ? undefined : normalizeMass(payload.mass);
  state.selection = { type: 'node', id: node.id };
  return { changed: true, node, selection: summarizeSelection(model, state.selection) };
}

function deleteNode(model, state, payload) {
  const id = requiredString(payload.id || payload.nodeId, 'id');
  getById(model.nodes, id, 'node');
  const connectedMembers = model.members.filter((member) => member.n1 === id || member.n2 === id).map((member) => member.id);
  if (connectedMembers.length && payload.deleteConnectedMembers === false) {
    throw new Error(`Node ${id} has connected members: ${connectedMembers.join(', ')}`);
  }
  const connectedSet = new Set(connectedMembers);
  model.loads = model.loads.filter((load) => load.node !== id && !connectedSet.has(load.member));
  model.members = model.members.filter((member) => !connectedSet.has(member.id));
  model.nodes = model.nodes.filter((node) => node.id !== id);
  if (state.selection?.id === id || connectedSet.has(state.selection?.id)) state.selection = { type: null, id: null };
  return { changed: true, deletedNodeId: id, deletedMemberIds: connectedMembers };
}

function setSupport(model, state, payload) {
  return updateNode(model, state, {
    id: payload.nodeId || payload.id,
    support: payload.support,
    fix: payload.fix,
  });
}

function setNodeMass(model, state, payload) {
  return updateNode(model, state, {
    id: payload.nodeId || payload.id,
    mass: payload.mass,
  });
}

function addMember(model, state, payload) {
  const n1 = requiredString(payload.n1 || payload.iNode, 'n1');
  const n2 = requiredString(payload.n2 || payload.jNode, 'n2');
  if (n1 === n2) throw new Error('Member end nodes must be different.');
  getById(model.nodes, n1, 'node');
  getById(model.nodes, n2, 'node');
  const member = {
    id: uniqueId(model.members, payload.id, 'M'),
    type: 'frame',
    n1,
    n2,
    matId: payload.matId || 'steel',
    secId: payload.secId || 'h300',
    localAxis: normalizeLocalAxis(payload.localAxis),
    releases: normalizeReleases(payload.releases),
  };
  if (payload.design) member.design = { ...payload.design };
  model.members.push(member);
  state.selection = { type: 'member', id: member.id };
  return { changed: true, member, selection: summarizeSelection(model, state.selection) };
}

function updateMember(model, state, payload) {
  const member = getById(model.members, requiredString(payload.id || payload.memberId, 'id'), 'member');
  if (payload.n1 != null) {
    getById(model.nodes, payload.n1, 'node');
    member.n1 = payload.n1;
  }
  if (payload.n2 != null) {
    getById(model.nodes, payload.n2, 'node');
    member.n2 = payload.n2;
  }
  if (member.n1 === member.n2) throw new Error('Member end nodes must be different.');
  if (payload.matId != null) member.matId = requiredString(payload.matId, 'matId');
  if (payload.secId != null) member.secId = requiredString(payload.secId, 'secId');
  if (payload.localAxis != null) member.localAxis = normalizeLocalAxis(payload.localAxis);
  if (payload.releases != null) member.releases = normalizeReleases(payload.releases);
  if (payload.design != null) member.design = { ...(member.design || {}), ...payload.design };
  state.selection = { type: 'member', id: member.id };
  return { changed: true, member, selection: summarizeSelection(model, state.selection) };
}

function deleteMember(model, state, payload) {
  const id = requiredString(payload.id || payload.memberId, 'id');
  getById(model.members, id, 'member');
  model.loads = model.loads.filter((load) => load.member !== id);
  model.members = model.members.filter((member) => member.id !== id);
  if (state.selection?.id === id) state.selection = { type: null, id: null };
  return { changed: true, deletedMemberId: id };
}

function assignSection(model, state, payload) {
  const memberIds = Array.isArray(payload.memberIds) && payload.memberIds.length
    ? payload.memberIds
    : state.selection?.type === 'member'
      ? [state.selection.id]
      : [];
  const secId = requiredString(payload.secId, 'secId');
  if (!memberIds.length) throw new Error('assignSection requires memberIds or a selected member.');
  for (const memberId of memberIds) getById(model.members, memberId, 'member').secId = secId;
  return { changed: true, memberIds, secId };
}

function addLoad(model, state, payload) {
  const type = payload.type || inferLoadType(payload);
  const load = {
    id: uniqueId(model.loads, payload.id, 'L'),
    type,
    case: payload.case || model.loadCases[0]?.id || 'D',
  };
  if (type === 'nodal') {
    load.node = requiredString(payload.node || payload.nodeId, 'node');
    getById(model.nodes, load.node, 'node');
    load.P = finite(payload.P, payload.value, 0);
    load.dir = payload.dir || '-z';
    if (payload.direction) load.direction = normalizeDirection(payload.direction);
  } else if (type === 'nmoment') {
    load.node = requiredString(payload.node || payload.nodeId, 'node');
    getById(model.nodes, load.node, 'node');
    load.M = finite(payload.M, payload.value, 0);
    load.axis = payload.axis || payload.dir || 'z';
  } else if (type === 'udl') {
    load.member = requiredString(payload.member || payload.memberId, 'member');
    getById(model.members, load.member, 'member');
    load.w = finite(payload.w, payload.value, 0);
    load.dir = payload.dir || '-z';
    load.coordinate = payload.coordinate || 'global';
    if (payload.direction) load.direction = normalizeDirection(payload.direction);
  } else if (type === 'point') {
    load.member = requiredString(payload.member || payload.memberId, 'member');
    getById(model.members, load.member, 'member');
    load.P = finite(payload.P, payload.value, 0);
    load.t = clamp(finite(payload.t, 0.5), 0, 1);
    load.dir = payload.dir || '-z';
    load.coordinate = payload.coordinate || 'global';
    if (payload.direction) load.direction = normalizeDirection(payload.direction);
  } else {
    throw new Error(`Unsupported load type: ${type}`);
  }
  model.loads.push(load);
  state.selection = { type: 'load', id: load.id };
  return { changed: true, load, selection: summarizeSelection(model, state.selection) };
}

function updateLoad(model, state, payload) {
  const load = getById(model.loads, requiredString(payload.id || payload.loadId, 'id'), 'load');
  if (payload.case != null) load.case = payload.case;
  if (payload.node != null || payload.nodeId != null) {
    load.node = payload.node || payload.nodeId;
    getById(model.nodes, load.node, 'node');
  }
  if (payload.member != null || payload.memberId != null) {
    load.member = payload.member || payload.memberId;
    getById(model.members, load.member, 'member');
  }
  if (payload.P != null || (payload.value != null && (load.type === 'nodal' || load.type === 'point'))) {
    load.P = finite(payload.P, payload.value, load.P || 0);
  }
  if (payload.M != null || (payload.value != null && load.type === 'nmoment')) {
    load.M = finite(payload.M, payload.value, load.M || 0);
  }
  if (payload.w != null || (payload.value != null && load.type === 'udl')) {
    load.w = finite(payload.w, payload.value, load.w || 0);
  }
  if (payload.t != null) load.t = clamp(finite(payload.t, load.t || 0.5), 0, 1);
  if (payload.dir != null) load.dir = payload.dir;
  if (payload.axis != null) load.axis = payload.axis;
  if (payload.coordinate != null) load.coordinate = payload.coordinate;
  if (payload.direction != null) load.direction = normalizeDirection(payload.direction);
  state.selection = { type: 'load', id: load.id };
  return { changed: true, load, selection: summarizeSelection(model, state.selection) };
}

function deleteLoad(model, state, payload) {
  const id = requiredString(payload.id || payload.loadId, 'id');
  getById(model.loads, id, 'load');
  model.loads = model.loads.filter((load) => load.id !== id);
  if (state.selection?.id === id) state.selection = { type: null, id: null };
  return { changed: true, deletedLoadId: id };
}

function addLoadCase(model, state, payload) {
  const loadCase = {
    id: uniqueId(model.loadCases, payload.id, 'LC'),
    name: payload.name || payload.id || 'Load case',
    type: payload.type || 'other',
  };
  model.loadCases.push(loadCase);
  state.selection = { type: 'loadCase', id: loadCase.id };
  return { changed: true, loadCase };
}

function updateLoadCase(model, state, payload) {
  const loadCase = getById(model.loadCases, requiredString(payload.id || payload.loadCaseId, 'id'), 'loadCase');
  if (payload.name != null) loadCase.name = String(payload.name);
  if (payload.type != null) loadCase.type = String(payload.type);
  state.selection = { type: 'loadCase', id: loadCase.id };
  return { changed: true, loadCase };
}

function addLoadCombination(model, state, payload) {
  const combo = {
    id: uniqueId(model.loadCombinations, payload.id, 'CO'),
    name: payload.name || payload.id || 'Combination',
    type: payload.type || 'strength',
    factors: normalizeFactors(payload.factors, model),
  };
  model.loadCombinations.push(combo);
  state.selection = { type: 'loadCombination', id: combo.id };
  return { changed: true, combo };
}

function updateLoadCombination(model, state, payload) {
  const combo = getById(model.loadCombinations, requiredString(payload.id || payload.comboId, 'id'), 'loadCombination');
  if (payload.name != null) combo.name = String(payload.name);
  if (payload.type != null) combo.type = String(payload.type);
  if (payload.factors != null) combo.factors = normalizeFactors(payload.factors, model);
  state.selection = { type: 'loadCombination', id: combo.id };
  return { changed: true, combo };
}

function createGridFrame(model, state, payload) {
  const baysX = Math.max(1, Math.trunc(finite(payload.baysX, 1)));
  const baysY = Math.max(1, Math.trunc(finite(payload.baysY, 1)));
  const stories = Math.max(1, Math.trunc(finite(payload.stories, 1)));
  const bayX = Math.max(0.1, finite(payload.bayX, 6));
  const bayY = Math.max(0.1, finite(payload.bayY, 4));
  const storyH = Math.max(0.1, finite(payload.storyH, 3));
  const replace = payload.replace !== false;
  if (replace) {
    model.nodes = [];
    model.members = [];
    model.loads = [];
  }

  const matId = payload.matId || 'steel';
  const secId = payload.secId || 'h300';
  const nodeAt = new Map();
  const key = (ix, iy, iz) => `${ix}:${iy}:${iz}`;
  const nodesBefore = model.nodes.length;
  const membersBefore = model.members.length;

  for (let iz = 0; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix <= baysX; ix += 1) {
        const node = {
          id: uniqueId(model.nodes, null, 'N'),
          x: ix * bayX,
          y: iy * bayY,
          z: iz * storyH,
          support: iz === 0 ? normalizeSupport(payload.baseSupport || 'fixed') : null,
        };
        model.nodes.push(node);
        nodeAt.set(key(ix, iy, iz), node.id);
      }
    }
  }

  const add = (n1, n2, role) => {
    model.members.push({
      id: uniqueId(model.members, null, 'M'),
      type: 'frame',
      n1,
      n2,
      matId,
      secId,
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
      design: { role },
    });
  };

  for (let iz = 0; iz < stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix <= baysX; ix += 1) {
        add(nodeAt.get(key(ix, iy, iz)), nodeAt.get(key(ix, iy, iz + 1)), 'column');
      }
    }
  }
  for (let iz = 1; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= baysY; iy += 1) {
      for (let ix = 0; ix < baysX; ix += 1) add(nodeAt.get(key(ix, iy, iz)), nodeAt.get(key(ix + 1, iy, iz)), 'beam');
    }
    for (let ix = 0; ix <= baysX; ix += 1) {
      for (let iy = 0; iy < baysY; iy += 1) add(nodeAt.get(key(ix, iy, iz)), nodeAt.get(key(ix, iy + 1, iz)), 'beam');
    }
  }

  state.selection = { type: null, id: null };
  return {
    changed: true,
    nodesAdded: model.nodes.length - nodesBefore,
    membersAdded: model.members.length - membersBefore,
    stories,
    baysX,
    baysY,
  };
}

function copyStory(model, state, payload) {
  const fromZ = finite(payload.fromZ, NaN);
  const toZ = finite(payload.toZ, NaN);
  if (!Number.isFinite(fromZ) || !Number.isFinite(toZ)) throw new Error('copyStory requires fromZ and toZ.');
  if (Math.abs(fromZ - toZ) < 1e-9) throw new Error('copyStory requires different fromZ and toZ.');
  const sourceNodes = model.nodes.filter((node) => sameCoord(node.z || 0, fromZ));
  if (!sourceNodes.length) throw new Error(`No source story nodes at z=${fromZ}.`);
  const map = new Map();
  let nodesAdded = 0;
  let membersAdded = 0;

  for (const node of sourceNodes) {
    const existing = model.nodes.find((candidate) => sameCoord(candidate.x, node.x) && sameCoord(candidate.y, node.y) && sameCoord(candidate.z || 0, toZ));
    if (existing) {
      map.set(node.id, existing.id);
      continue;
    }
    const copy = {
      ...node,
      id: uniqueId(model.nodes, null, 'N'),
      z: toZ,
      support: payload.targetSupport === undefined ? null : normalizeSupport(payload.targetSupport),
    };
    delete copy.fix;
    model.nodes.push(copy);
    map.set(node.id, copy.id);
    nodesAdded += 1;
  }

  const sourceIds = new Set(sourceNodes.map((node) => node.id));
  for (const member of model.members.filter((item) => sourceIds.has(item.n1) && sourceIds.has(item.n2))) {
    const n1 = map.get(member.n1);
    const n2 = map.get(member.n2);
    if (!n1 || !n2 || memberExists(model, n1, n2)) continue;
    model.members.push({
      ...member,
      id: uniqueId(model.members, null, 'M'),
      n1,
      n2,
      design: { ...(member.design || {}), role: member.design?.role || 'beam' },
    });
    membersAdded += 1;
  }

  if (payload.connectColumns !== false) {
    for (const node of sourceNodes) {
      const topId = map.get(node.id);
      if (!topId || memberExists(model, node.id, topId)) continue;
      const template = nearestMemberAtNode(model, node.id);
      model.members.push({
        id: uniqueId(model.members, null, 'M'),
        type: 'frame',
        n1: node.id,
        n2: topId,
        matId: payload.matId || template?.matId || 'steel',
        secId: payload.secId || template?.secId || 'h300',
        localAxis: { roll: 0, strongAxis: 'z' },
        releases: { i: 'rigid', j: 'rigid' },
        design: { role: 'column' },
      });
      membersAdded += 1;
    }
  }

  state.selection = { type: null, id: null };
  return { changed: true, fromZ, toZ, nodesAdded, membersAdded };
}

function autoAssignMemberRoles(model, state) {
  const roles = { beam: 0, column: 0, brace: 0 };
  for (const member of model.members) {
    const role = inferMemberRole(model, member);
    member.design = { ...(member.design || {}), role };
    roles[role] += 1;
  }
  return { changed: true, roles };
}

function applyLoadTemplate(model, state, payload) {
  const template = payload.template || 'gravityUdl';
  const caseId = payload.case || (template.startsWith('wind') ? 'W' : 'D');
  ensureLoadCase(model, caseId, payload.caseType || inferLoadCaseType(caseId, template));
  const comboIdsAdded = ensureActiveLoadCombination(model, caseId, template);
  const nextPayload = { ...payload, case: caseId };
  if (template === 'gravityUdl') return { ...applyGravityUdl(model, state, nextPayload), comboIdsAdded };
  if (template === 'windX' || template === 'windY') return { ...applyLateralNodalLoads(model, state, nextPayload, template), comboIdsAdded };
  throw new Error(`Unsupported load template: ${template}`);
}

function generateFloorMass(model, state, payload) {
  const massPerFloor = Math.max(0, finite(payload.massPerFloor, 10));
  const includeBase = !!payload.includeBase;
  const floorZs = uniqueZ(model.nodes)
    .filter((z) => includeBase || z > 1e-9)
    .sort((a, b) => a - b);
  let updatedNodes = 0;
  for (const z of floorZs) {
    const floorNodes = model.nodes.filter((node) => sameCoord(node.z || 0, z));
    if (!floorNodes.length) continue;
    const nodeMass = massPerFloor / floorNodes.length;
    for (const node of floorNodes) {
      node.mass = [nodeMass, nodeMass, nodeMass];
      updatedNodes += 1;
    }
  }
  return { changed: true, floorCount: floorZs.length, updatedNodes, massPerFloor };
}

function findEntity(model, type, id) {
  const collection = {
    node: model.nodes,
    member: model.members,
    load: model.loads,
    loadCase: model.loadCases,
    loadCombination: model.loadCombinations,
  }[type];
  return collection?.find((item) => item.id === id) || null;
}

function ensureCollections(model) {
  model.nodes ||= [];
  model.members ||= [];
  model.loads ||= [];
  model.stories ||= [];
  model.loadCases ||= [];
  model.loadCombinations ||= [];
  model.materials ||= [];
  model.sections ||= [];
  model.analysisSettings ||= {};
}

function refreshStories(model) {
  const normalized = normalizeStories(model);
  model.stories = normalized.stories;
  model.storyModel = normalized.storyModel;
}

function getById(items, id, label) {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`${label} not found: ${id}`);
  return found;
}

function uniqueId(items, requested, prefix) {
  if (requested) {
    const id = String(requested);
    if (items.some((item) => item.id === id)) throw new Error(`Duplicate id: ${id}`);
    return id;
  }
  let index = 1;
  const ids = new Set(items.map((item) => item.id));
  while (ids.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function uniquePreferredId(items, preferred, prefix) {
  const requested = String(preferred || '').trim();
  if (requested && !items.some((item) => item.id === requested)) return requested;
  return uniqueId(items, null, prefix);
}

function requiredString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function normalizeSupport(value) {
  if (value == null || value === '') return null;
  const support = String(value);
  if (!['fixed', 'pin', 'roller', 'custom'].includes(support)) throw new Error(`Unsupported support: ${support}`);
  return support;
}

function normalizeFix(value) {
  if (!Array.isArray(value) || value.length !== 6) throw new Error('fix must be a six-item boolean array.');
  return value.map(Boolean);
}

function normalizeMass(value) {
  if (Array.isArray(value)) return value.slice(0, 6).map((item) => finite(item, 0));
  return finite(value, 0);
}

function normalizeLocalAxis(value = {}) {
  return {
    roll: finite(value.roll, 0),
    strongAxis: value.strongAxis || 'z',
  };
}

function normalizeReleases(value = {}) {
  if (value.i || value.j) {
    return {
      i: normalizeRelease(value.i),
      j: normalizeRelease(value.j),
    };
  }
  return { i: 'rigid', j: 'rigid' };
}

function normalizeRelease(value) {
  const release = value || 'rigid';
  if (!['rigid', 'pin'].includes(release)) throw new Error(`Unsupported release: ${release}`);
  return release;
}

function normalizeDirection(value) {
  if (!Array.isArray(value) || value.length < 3) throw new Error('direction must contain three numbers.');
  return value.slice(0, 3).map((item) => finite(item, 0));
}

function normalizeFactors(factors, model) {
  const normalized = {};
  const source = factors && typeof factors === 'object' ? factors : {};
  for (const loadCase of model.loadCases) {
    if (source[loadCase.id] != null) normalized[loadCase.id] = finite(source[loadCase.id], 0);
  }
  for (const [caseId, value] of Object.entries(source)) {
    if (!(caseId in normalized)) normalized[caseId] = finite(value, 0);
  }
  return normalized;
}

function inferLoadType(payload) {
  if (payload.member || payload.memberId) return payload.w != null ? 'udl' : 'point';
  if (payload.M != null) return 'nmoment';
  return 'nodal';
}

function applyGravityUdl(model, state, payload) {
  const caseId = payload.case || 'D';
  const w = finite(payload.w, payload.value, 5);
  const source = payload.source || 'template:gravityUdl';
  const removedLoadCount = payload.replace === false ? 0 : removeTemplateLoads(model, source, caseId);
  const members = model.members.filter((member) => {
    const role = member.design?.role || inferMemberRole(model, member);
    return role === 'beam';
  });
  let next = nextIdIndex(model.loads, 'L');
  const added = [];
  for (const member of members) {
    const load = {
      id: `L${next++}`,
      type: 'udl',
      member: member.id,
      w,
      dir: payload.dir || '-z',
      coordinate: payload.coordinate || 'global',
      case: caseId,
      source,
    };
    model.loads.push(load);
    added.push(load.id);
  }
  state.selection = added.length ? { type: 'load', id: added[added.length - 1] } : state.selection;
  return { changed: added.length > 0 || removedLoadCount > 0, template: 'gravityUdl', addedLoadIds: added, removedLoadCount };
}

function applyLateralNodalLoads(model, state, payload, template) {
  const caseId = payload.case || 'W';
  const direction = payload.dir || (template === 'windX' ? '+x' : '+y');
  const total = finite(payload.total, payload.P, payload.value, 10);
  const includeBase = !!payload.includeBase;
  const source = payload.source || `template:${template}`;
  const removedLoadCount = payload.replace === false ? 0 : removeTemplateLoads(model, source, caseId);
  const nodes = model.nodes.filter((node) => includeBase || (node.z || 0) > 1e-9);
  if (!nodes.length) return { changed: removedLoadCount > 0, template, addedLoadIds: [], removedLoadCount };
  const perNode = total / nodes.length;
  let next = nextIdIndex(model.loads, 'L');
  const added = [];
  for (const node of nodes) {
    const load = {
      id: `L${next++}`,
      type: 'nodal',
      node: node.id,
      P: perNode,
      dir: direction,
      case: caseId,
      source,
    };
    model.loads.push(load);
    added.push(load.id);
  }
  state.selection = added.length ? { type: 'load', id: added[added.length - 1] } : state.selection;
  return { changed: added.length > 0 || removedLoadCount > 0, template, addedLoadIds: added, removedLoadCount, perNode };
}

function ensureLoadCase(model, id, type = 'other') {
  const existing = model.loadCases.find((loadCase) => loadCase.id === id);
  if (!existing) {
    model.loadCases.push({ id, name: id, type });
  } else if ((!existing.type || existing.type === 'other') && type !== 'other') {
    existing.type = type;
  }
  for (const combo of model.loadCombinations) {
    combo.factors ||= {};
    if (!(id in combo.factors)) combo.factors[id] = 0;
  }
}

function inferLoadCaseType(caseId, template) {
  if (template.startsWith('wind')) return 'wind';
  if (caseId === 'D') return 'dead';
  if (caseId === 'L') return 'live';
  return 'other';
}

function ensureActiveLoadCombination(model, caseId, template) {
  if (model.loadCombinations.some((combo) => Math.abs(Number(combo.factors?.[caseId]) || 0) > 0)) return [];
  const safeCase = String(caseId).replace(/[^A-Za-z0-9_-]/g, '') || 'CASE';
  const factors = {};
  for (const loadCase of model.loadCases) factors[loadCase.id] = 0;
  if (caseId !== 'D' && model.loadCases.some((loadCase) => loadCase.id === 'D')) factors.D = 1;
  factors[caseId] = 1;
  const id = uniquePreferredId(model.loadCombinations, `CO-${safeCase}`, 'CO');
  model.loadCombinations.push({
    id,
    name: template.startsWith('wind') && caseId !== 'D' ? `1.0D + 1.0${caseId}` : `1.0${caseId}`,
    type: 'strength',
    factors,
  });
  return [id];
}

function removeTemplateLoads(model, source, caseId) {
  const before = model.loads.length;
  model.loads = model.loads.filter((load) => !(load.source === source && load.case === caseId));
  return before - model.loads.length;
}

function inferMemberRole(model, member) {
  const a = model.nodes.find((node) => node.id === member.n1);
  const b = model.nodes.find((node) => node.id === member.n2);
  if (!a || !b) return 'beam';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = (b.z || 0) - (a.z || 0);
  const length = Math.hypot(dx, dy, dz) || 1;
  const vertical = Math.abs(dz) / length;
  if (vertical > 0.75) return 'column';
  if (vertical > 0.15 && vertical <= 0.75) return 'brace';
  return 'beam';
}

function memberExists(model, n1, n2) {
  return model.members.some((member) => (
    (member.n1 === n1 && member.n2 === n2) ||
    (member.n1 === n2 && member.n2 === n1)
  ));
}

function nearestMemberAtNode(model, nodeId) {
  return model.members.find((member) => member.n1 === nodeId || member.n2 === nodeId) || null;
}

function uniqueZ(nodes) {
  const values = [];
  for (const node of nodes) {
    const z = Number((node.z || 0).toFixed(9));
    if (!values.some((value) => sameCoord(value, z))) values.push(z);
  }
  return values;
}

function sameCoord(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-8;
}

function nextIdIndex(items, prefix) {
  let max = 0;
  for (const item of items) {
    const match = String(item.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
