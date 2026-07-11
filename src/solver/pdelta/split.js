import { memberAxes } from '../linear3dElement.js';

export const PDELTA_SPLIT_VERSION = 'p6-m5-pdelta-split-v1';

export function buildPDeltaSplitTrace(model = {}, firstOrder = {}, secondOrder = {}) {
  const storyRows = storySplitRows(model, firstOrder, secondOrder);
  const memberRows = memberSplitRows(model, firstOrder, secondOrder);
  return {
    version: PDELTA_SPLIT_VERSION,
    method: 'P-Delta global story drift and member chord P-delta diagnostic split',
    storyRows,
    memberRows,
    summary: {
      storyRowCount: storyRows.length,
      memberRowCount: memberRows.length,
      maxStoryDelta: Math.max(0, ...storyRows.map((row) => row.secondOrderDrift)),
      maxMemberSmallDelta: Math.max(0, ...memberRows.map((row) => row.localChordDrift)),
    },
    limitations: [
      'P-Delta rows represent large story sway effects.',
      'P-delta rows are member chord-drift diagnostics, not a full corotational local curvature integration.',
    ],
  };
}

function storySplitRows(model, firstOrder, secondOrder) {
  const levels = uniqueSorted((model.nodes || []).map((node) => Number(node.z) || 0));
  const rows = [];
  for (let i = 1; i < levels.length; i += 1) {
    const bottom = levels[i - 1];
    const top = levels[i];
    rows.push({
      story: i,
      bottomZ: bottom,
      topZ: top,
      height: top - bottom,
      firstOrderDrift: storyDriftAt(model, firstOrder, bottom, top),
      secondOrderDrift: storyDriftAt(model, secondOrder, bottom, top),
      component: 'P-Delta',
    });
  }
  return rows;
}

function memberSplitRows(model, firstOrder, secondOrder) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  return (model.members || []).map((member) => {
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!a || !b) return null;
    const ax = memberAxes(a, b, member.localAxis);
    const da = secondOrder.disp?.[a.id] || [0, 0, 0];
    const db = secondOrder.disp?.[b.id] || [0, 0, 0];
    const du = [
      (Number(db[0]) || 0) - (Number(da[0]) || 0),
      (Number(db[1]) || 0) - (Number(da[1]) || 0),
      (Number(db[2]) || 0) - (Number(da[2]) || 0),
    ];
    const localY = dot(du, ax.y);
    const localZ = dot(du, ax.z);
    return {
      memberId: member.id,
      component: 'P-delta',
      length: ax.L,
      localChordDriftY: localY,
      localChordDriftZ: localZ,
      localChordDrift: Math.hypot(localY, localZ),
      firstOrderAxial: average(firstOrder.memberResults?.[member.id]?.N),
      secondOrderAxial: secondOrder.axialForces?.[member.id] ?? null,
    };
  }).filter(Boolean);
}

function storyDriftAt(model, result, bottomZ, topZ) {
  const bottom = averageDisplacementAt(model, result, bottomZ);
  const top = averageDisplacementAt(model, result, topZ);
  return Math.hypot(top.x - bottom.x, top.y - bottom.y);
}

function averageDisplacementAt(model, result, z) {
  const nodes = (model.nodes || []).filter((node) => Math.abs((Number(node.z) || 0) - z) <= 1e-8);
  if (!nodes.length) return { x: 0, y: 0 };
  const sum = nodes.reduce((acc, node) => {
    const d = result?.disp?.[node.id] || [0, 0, 0];
    acc.x += Number(d[0]) || 0;
    acc.y += Number(d[1]) || 0;
    return acc;
  }, { x: 0, y: 0 });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length };
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(8))))].sort((a, b) => a - b);
}

function dot(a, b) {
  return (Number(a[0]) || 0) * (Number(b[0]) || 0)
    + (Number(a[1]) || 0) * (Number(b[1]) || 0)
    + (Number(a[2]) || 0) * (Number(b[2]) || 0);
}

function average(values = []) {
  const numbers = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}
