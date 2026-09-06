import { materialOf, sectionOf } from './catalogs.js';
import { round6 } from './storyMassValues.js';

export function columnProxy(model, member, nodes, story) {
  const a = nodes[member?.n1];
  const b = nodes[member?.n2];
  if (!isColumn(a, b) || !spansStory(a, b, story)) return null;
  const section = sectionOf(model, member.secId);
  const material = materialOf(model, member.matId);
  const h = Math.max(1e-6, story.height);
  return {
    x: round6((Number(a.x || 0) + Number(b.x || 0)) / 2),
    y: round6((Number(a.y || 0) + Number(b.y || 0)) / 2),
    weight: material.E * ((section.Iy || 0) + (section.Iz || 0)) / h ** 3,
  };
}

function isColumn(a, b) {
  return a && b && Math.abs(Number(a.x) - Number(b.x)) <= 1e-6 && Math.abs(Number(a.y) - Number(b.y)) <= 1e-6;
}

function spansStory(a, b, story) {
  const lo = Math.min(Number(a.z || 0), Number(b.z || 0));
  const hi = Math.max(Number(a.z || 0), Number(b.z || 0));
  return lo <= story.baseZ + 1e-6 && hi >= story.topZ - 1e-6;
}
