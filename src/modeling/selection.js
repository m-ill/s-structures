export const MODEL_SELECTION_VERSION = 'p7-m3-selection-v1';

export function selectMembersByFilter(model, filter = {}) {
  const nodes = new Map((model.nodes || []).map((node) => [node.id, node]));
  const sets = {
    ids: stringSet(filter.ids),
    roles: stringSet(filter.roles || filter.role),
    stories: stringSet(filter.storyIds || filter.storyId),
    materials: stringSet(filter.materialIds || filter.materialId),
    sections: stringSet(filter.sectionIds || filter.sectionId),
    types: stringSet(filter.types || filter.type),
  };
  const tolerance = Number(filter.tolerance) > 0 ? Number(filter.tolerance) : 1e-8;
  return (model.members || []).filter((member) => {
    if (sets.ids.size && !sets.ids.has(member.id)) return false;
    if (sets.roles.size && !sets.roles.has(member.design?.role || member.role)) return false;
    if (sets.stories.size && !sets.stories.has(member.design?.storyId || member.storyId)) return false;
    if (sets.materials.size && !sets.materials.has(member.matId)) return false;
    if (sets.sections.size && !sets.sections.has(member.secId)) return false;
    if (sets.types.size && !sets.types.has(member.type || 'frame')) return false;
    if (!filter.bounds) return true;
    const a = nodes.get(member.n1); const b = nodes.get(member.n2);
    if (!a || !b) return false;
    const insideA = inside(a, filter.bounds, tolerance);
    const insideB = inside(b, filter.bounds, tolerance);
    return filter.selectionMode === 'crossing' ? insideA || insideB || segmentBoxOverlap(a, b, filter.bounds, tolerance) : insideA && insideB;
  });
}

export function selectNodesByFilter(model, filter = {}) {
  const ids = stringSet(filter.ids);
  const stories = stringSet(filter.storyIds || filter.storyId);
  const tolerance = Number(filter.tolerance) > 0 ? Number(filter.tolerance) : 1e-8;
  return (model.nodes || []).filter((node) => {
    if (ids.size && !ids.has(node.id)) return false;
    if (stories.size && !stories.has(node.storyId)) return false;
    return !filter.bounds || inside(node, filter.bounds, tolerance);
  });
}

function inside(point, bounds, tolerance) {
  return ['x', 'y', 'z'].every((axis) => {
    const min = Number(bounds[`min${axis.toUpperCase()}`] ?? bounds.min?.[axis] ?? -Infinity);
    const max = Number(bounds[`max${axis.toUpperCase()}`] ?? bounds.max?.[axis] ?? Infinity);
    const value = Number(point[axis] || 0);
    return value >= min - tolerance && value <= max + tolerance;
  });
}

function segmentBoxOverlap(a, b, bounds, tolerance) {
  let enter = 0;
  let exit = 1;
  for (const axis of ['x', 'y', 'z']) {
    const start = Number(a[axis] || 0);
    const end = Number(b[axis] || 0);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    const min = Number(bounds[`min${axis.toUpperCase()}`] ?? bounds.min?.[axis] ?? -Infinity) - tolerance;
    const max = Number(bounds[`max${axis.toUpperCase()}`] ?? bounds.max?.[axis] ?? Infinity) + tolerance;
    const delta = end - start;
    if (Math.abs(delta) <= Number.EPSILON) {
      if (start < min || start > max) return false;
      continue;
    }
    const first = (min - start) / delta;
    const second = (max - start) / delta;
    enter = Math.max(enter, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (enter > exit) return false;
  }
  return true;
}

function stringSet(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return new Set(values.map((item) => String(item)).filter(Boolean));
}
