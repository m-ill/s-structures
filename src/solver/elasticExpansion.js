export const ELASTIC_EXPANSION_VERSION = 'p3-m11-elastic-expansion';

export function expandAdvancedLoads(loads = [], model = {}, options = {}) {
  const segments = Math.max(2, options.segments || 8);
  const lengths = memberLengths(model);
  const expanded = [];
  const warnings = [];
  const featureCounts = {
    partialDistributed: 0,
    trapezoid: 0,
    memberMoment: 0,
    temperature: 0,
    temperatureGradient: 0,
  };
  for (const load of loads) {
    if (load.type === 'udl-partial' || load.type === 'trapezoid') {
      if (load.type === 'udl-partial') featureCounts.partialDistributed += 1;
      if (load.type === 'trapezoid') featureCounts.trapezoid += 1;
      expanded.push(...expandDistributed(load, segments, lengths[load.member] || 1));
    } else if (load.type === 'temperature' || load.type === 'tgradient') {
      if (load.type === 'temperature') featureCounts.temperature += 1;
      if (load.type === 'tgradient') featureCounts.temperatureGradient += 1;
      expanded.push({ ...load, sourceType: load.type });
    } else if (load.type === 'mmoment') {
      featureCounts.memberMoment += 1;
      expanded.push({ ...load, sourceType: load.type });
    }
    else expanded.push(load);
  }
  return {
    loads: expanded,
    trace: {
      version: ELASTIC_EXPANSION_VERSION,
      inputCount: loads.length,
      outputCount: expanded.length,
      warnings,
      modelMembers: model.members?.length || 0,
      features: {
        ...featureCounts,
        springSupports: countSpringSupports(model),
        settlements: countSettlements(model),
        trussMembers: countMembersByType(model, ['truss']),
        tensionOnlyMembers: countMembersByType(model, ['tensionOnly']),
        compressionOnlyMembers: countMembersByType(model, ['compressionOnly']),
        memberOffsets: countMemberOffsets(model),
      },
      supportTrace: buildSupportTrace(model),
      memberTrace: buildMemberTrace(model),
    },
  };
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

function countSpringSupports(model = {}) {
  return (model.nodes || []).filter((node) => node.support === 'spring').length;
}

function countSettlements(model = {}) {
  return (model.nodes || []).filter((node) => node.settlement && Object.keys(node.settlement).length > 0).length;
}

function countMembersByType(model = {}, types = []) {
  return (model.members || []).filter((member) => types.includes(member.type || member.behavior)).length;
}

function countMemberOffsets(model = {}) {
  return (model.members || []).filter((member) => {
    const offset = member.endOffset || {};
    return Number(offset.i || 0) !== 0 || Number(offset.j || 0) !== 0;
  }).length;
}

function buildSupportTrace(model = {}) {
  return (model.nodes || [])
    .filter((node) => node.support === 'spring' || node.settlement)
    .map((node) => ({
      node: node.id,
      support: node.support || null,
      springKeys: Object.entries(node.spring || {}).filter(([, value]) => Number(value) > 0).map(([key]) => key).sort(),
      settlementKeys: Object.keys(node.settlement || {}).sort(),
    }));
}

function buildMemberTrace(model = {}) {
  return (model.members || [])
    .filter((member) => ['truss', 'tensionOnly', 'compressionOnly'].includes(member.type || member.behavior) || member.endOffset)
    .map((member) => ({
      member: member.id,
      behavior: member.type || member.behavior || 'frame',
      endOffset: member.endOffset || null,
    }));
}
