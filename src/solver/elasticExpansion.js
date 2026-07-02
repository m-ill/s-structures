export const ELASTIC_EXPANSION_VERSION = 'p3-m11-elastic-expansion';

export function expandAdvancedLoads(loads = [], model = {}, options = {}) {
  const segments = Math.max(2, options.segments || 8);
  const lengths = memberLengths(model);
  const expanded = [];
  const warnings = [];
  for (const load of loads) {
    if (load.type === 'udl-partial' || load.type === 'trapezoid') expanded.push(...expandDistributed(load, segments, lengths[load.member] || 1));
    else if (load.type === 'temperature' || load.type === 'tgradient') expanded.push({ ...load, sourceType: load.type });
    else if (load.type === 'mmoment') expanded.push({ ...load, sourceType: load.type });
    else expanded.push(load);
  }
  return { loads: expanded, trace: { version: ELASTIC_EXPANSION_VERSION, inputCount: loads.length, outputCount: expanded.length, warnings, modelMembers: model.members?.length || 0 } };
}

function expandDistributed(load, segments, length) {
  const from = clamp(load.from ?? 0);
  const to = clamp(load.to ?? 1);
  if (!(to > from)) return [];
  const out = [];
  for (let i = 0; i < segments; i += 1) {
    const a = from + (to - from) * i / segments;
    const b = from + (to - from) * (i + 1) / segments;
    const t = (a + b) / 2;
    const w = load.type === 'trapezoid' ? Number(load.w1 || 0) + (Number(load.w2 || 0) - Number(load.w1 || 0)) * ((t - from) / (to - from)) : Number(load.w || 0);
    out.push({ ...load, id: `${load.id || 'LD'}_${i + 1}`, type: 'point', P: w * (b - a) * length, t, sourceType: load.type });
  }
  return out;
}

function memberLengths(model = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const out = {};
  for (const member of model.members || []) {
    const a = nodes[member.n1]; const b = nodes[member.n2];
    if (a && b) out[member.id] = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
  }
  return out;
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}
