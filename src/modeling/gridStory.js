import { applyModelChangeSet } from './transaction.js';

export const GRID_STORY_MODEL_VERSION = 'p7-m3-grid-story-v1';

export function planGridStoryModel(input = {}) {
  const xGrids = normalizeAxes(input.xGrids, 'X');
  const yGrids = normalizeAxes(input.yGrids, 'Y');
  const levels = normalizeLevels(input.levels);
  const errors = [];
  if (xGrids.length < 2) errors.push('xGrids:at-least-two');
  if (yGrids.length < 2) errors.push('yGrids:at-least-two');
  if (levels.length < 2) errors.push('levels:at-least-two');
  if (!strictlyIncreasing(xGrids.map((item) => item.coordinate))) errors.push('xGrids:not-increasing');
  if (!strictlyIncreasing(yGrids.map((item) => item.coordinate))) errors.push('yGrids:not-increasing');
  if (!strictlyIncreasing(levels.map((item) => item.elevation))) errors.push('levels:not-increasing');
  if (errors.length) return { ok: false, errors, nodes: [], members: [], stories: [] };

  const defaults = normalizeRoleDefaults(input.roleDefaults);
  const nodes = [];
  const members = [];
  const nodeId = (level, x, y) => `N:${safe(level.id)}:${safe(x.label)}:${safe(y.label)}`;
  for (const level of levels) {
    for (const y of yGrids) {
      for (const x of xGrids) {
        nodes.push({
          id: nodeId(level, x, y),
          x: x.coordinate,
          y: y.coordinate,
          z: level.elevation,
          support: level.support || null,
          grid: { x: x.label, y: y.label },
          storyId: level.id,
          origin: 'grid-story-plan',
        });
      }
    }
  }

  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const lower = levels[levelIndex];
    const upper = levels[levelIndex + 1];
    for (const y of yGrids) for (const x of xGrids) {
      members.push(member(
        `C:${safe(lower.id)}:${safe(upper.id)}:${safe(x.label)}:${safe(y.label)}`,
        nodeId(lower, x, y), nodeId(upper, x, y), 'column', defaults.column,
        { storyId: upper.id, gridX: x.label, gridY: y.label },
      ));
    }
  }

  for (const level of levels.slice(1)) {
    for (const y of yGrids) for (let i = 0; i < xGrids.length - 1; i += 1) {
      const a = xGrids[i]; const b = xGrids[i + 1];
      members.push(member(
        `BX:${safe(level.id)}:${safe(y.label)}:${safe(a.label)}:${safe(b.label)}`,
        nodeId(level, a, y), nodeId(level, b, y), 'beam', defaults.beam,
        { storyId: level.id, gridY: y.label, span: [a.label, b.label] },
      ));
    }
    for (const x of xGrids) for (let i = 0; i < yGrids.length - 1; i += 1) {
      const a = yGrids[i]; const b = yGrids[i + 1];
      members.push(member(
        `BY:${safe(level.id)}:${safe(x.label)}:${safe(a.label)}:${safe(b.label)}`,
        nodeId(level, x, a), nodeId(level, x, b), 'beam', defaults.beam,
        { storyId: level.id, gridX: x.label, span: [a.label, b.label] },
      ));
    }
  }

  const stories = levels.map((level, index) => ({
    id: level.id,
    name: level.name || level.id,
    elevation: level.elevation,
    z: level.elevation,
    height: index ? level.elevation - levels[index - 1].elevation : 0,
    index,
  }));
  return {
    ok: true,
    version: GRID_STORY_MODEL_VERSION,
    xGrids,
    yGrids,
    levels,
    nodes,
    members,
    stories,
    summary: { nodeCount: nodes.length, memberCount: members.length, storyCount: stories.length },
  };
}

export function gridStoryChangeSet(model, plan, options = {}) {
  if (!plan?.ok) return { ok: false, errors: plan?.errors || ['invalid-plan'], changes: [] };
  const replace = options.mode !== 'append';
  const changes = [];
  if (replace) {
    const nodeIds = new Set((model.nodes || []).map((item) => item.id));
    const memberIds = new Set((model.members || []).map((item) => item.id));
    for (const load of model.loads || []) {
      if ((load.node && nodeIds.has(load.node)) || (load.member && memberIds.has(load.member))) {
        changes.push({ op: 'remove', collection: 'loads', id: load.id });
      }
    }
    for (const member of model.members || []) changes.push({ op: 'remove', collection: 'members', id: member.id });
    for (const node of model.nodes || []) changes.push({ op: 'remove', collection: 'nodes', id: node.id });
    for (const story of model.stories || []) changes.push({ op: 'remove', collection: 'stories', id: story.id });
  }
  for (const node of plan.nodes) changes.push({ op: 'add', collection: 'nodes', id: node.id, value: node });
  for (const memberRow of plan.members) changes.push({ op: 'add', collection: 'members', id: memberRow.id, value: memberRow });
  for (const story of plan.stories) changes.push({ op: 'add', collection: 'stories', id: story.id, value: story });
  return {
    ok: true,
    id: options.id || 'grid-story-apply',
    name: options.name || 'Apply grid and stories',
    changes,
    preview: summarizePreview(changes),
  };
}

export function applyGridStoryPlan(model, plan, options = {}) {
  const changeSet = gridStoryChangeSet(model, plan, options);
  return changeSet.ok ? applyModelChangeSet(model, changeSet, options) : { ...changeSet, model, changed: false };
}

export function planCopyStory(model, options = {}) {
  const sourceId = String(options.sourceStoryId || '').trim();
  const targetId = String(options.targetStoryId || '').trim();
  const source = (model.stories || []).find((item) => item.id === sourceId);
  const targetElevation = Number(options.targetElevation);
  if (!source || !targetId || !Number.isFinite(targetElevation)) return { ok: false, errors: ['source-or-target-invalid'], changes: [] };
  if ((model.stories || []).some((item) => item.id === targetId || Math.abs(storyElevation(item) - targetElevation) <= 1e-9)) {
    return { ok: false, errors: ['target-story-exists'], changes: [] };
  }
  const sourceElevation = storyElevation(source);
  const sourceNodes = (model.nodes || []).filter((node) => Math.abs(Number(node.z) - sourceElevation) <= 1e-9);
  const sourceNodeIds = new Set(sourceNodes.map((node) => node.id));
  const map = new Map(sourceNodes.map((node) => [node.id, `${node.id}@${safe(targetId)}`]));
  const changes = sourceNodes.map((node) => ({
    op: 'add', collection: 'nodes', id: map.get(node.id), value: {
      ...node, id: map.get(node.id), z: targetElevation, support: null, storyId: targetId, origin: 'story-copy',
    },
  }));
  const copiedMemberIds = new Map();
  if (options.includeMembers !== false) {
    for (const row of model.members || []) {
      if (!sourceNodeIds.has(row.n1) || !sourceNodeIds.has(row.n2)) continue;
      const id = `${row.id}@${safe(targetId)}`;
      copiedMemberIds.set(row.id, id);
      changes.push({ op: 'add', collection: 'members', id, value: { ...row, id, n1: map.get(row.n1), n2: map.get(row.n2), design: { ...(row.design || {}), storyId: targetId }, origin: 'story-copy' } });
    }
  }
  if (options.includeColumns !== false) {
    for (const node of sourceNodes) {
      const id = `C:${safe(sourceId)}:${safe(targetId)}:${safe(node.id)}`;
      changes.push({ op: 'add', collection: 'members', id, value: member(id, node.id, map.get(node.id), 'column', options.columnDefaults, { storyId: targetId }) });
    }
  }
  if (options.includeLoads) {
    for (const load of model.loads || []) {
      if (!sourceNodeIds.has(load.node) && !copiedMemberIds.has(load.member)) continue;
      const id = `${load.id}@${safe(targetId)}`;
      changes.push({ op: 'add', collection: 'loads', id, value: { ...load, id, node: load.node ? map.get(load.node) : undefined, member: load.member ? copiedMemberIds.get(load.member) : undefined, origin: 'story-copy' } });
    }
  }
  const story = { ...source, id: targetId, name: options.targetName || targetId, elevation: targetElevation, z: targetElevation, height: targetElevation - sourceElevation };
  changes.push({ op: 'add', collection: 'stories', id: targetId, value: story });
  return { ok: true, id: `copy-story:${sourceId}:${targetId}`, name: `Copy story ${sourceId} to ${targetId}`, changes, preview: summarizePreview(changes) };
}

function normalizeAxes(values, prefix) {
  return (Array.isArray(values) ? values : []).map((item, index) => typeof item === 'number'
    ? { label: `${prefix}${index + 1}`, coordinate: item }
    : { label: String(item.label || `${prefix}${index + 1}`), coordinate: Number(item.coordinate ?? item.position) });
}

function normalizeLevels(values) {
  return (Array.isArray(values) ? values : []).map((item, index) => typeof item === 'number'
    ? { id: `L${index}`, name: `L${index}`, elevation: item, support: index === 0 ? 'fixed' : null }
    : { ...item, id: String(item.id || `L${index}`), elevation: Number(item.elevation ?? item.z), support: item.support ?? (index === 0 ? 'fixed' : null) });
}

function normalizeRoleDefaults(input = {}) {
  return {
    column: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1', ...(input?.column || {}) },
    beam: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1', ...(input?.beam || {}) },
    brace: { matId: 'SS275@1', secId: 'H-300x150x6.5x9@1', ...(input?.brace || {}) },
  };
}

function member(id, n1, n2, role, defaults = {}, metadata = {}) {
  return {
    id, type: role === 'brace' ? 'truss' : 'frame', n1, n2,
    matId: defaults?.matId || 'SS275@1', secId: defaults?.secId || 'H-300x150x6.5x9@1',
    localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
    design: { ...(defaults?.design || {}), role, ...metadata }, origin: 'grid-story-plan',
  };
}

function summarizePreview(changes) {
  return changes.reduce((out, item) => {
    const key = `${item.collection}.${item.op}`;
    out[key] = (out[key] || 0) + 1;
    return out;
  }, {});
}

function storyElevation(story) { return Number(story.elevation ?? story.z); }
function safe(value) { return String(value).trim().replace(/[^A-Za-z0-9_.:-]+/g, '_'); }
function strictlyIncreasing(values) { return values.every((value, index) => Number.isFinite(value) && (!index || value > values[index - 1])); }
