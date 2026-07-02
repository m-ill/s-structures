import { materialOf, sectionOf } from '../core/catalogs.js';

export const ELASTIC_EXPANSION_VERSION = 'p3-m11-elastic-expansion';

export function expandAdvancedLoads(loads = [], model = {}, options = {}) {
  const segments = Math.max(2, options.segments || 8);
  const lengths = memberLengths(model);
  const expanded = [];
  const warnings = [];
  const loadTrace = [];
  const handcalc = [];
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
      const rows = expandDistributed(load, segments, lengths[load.member] || 1);
      expanded.push(...rows);
      loadTrace.push({
        id: load.id || null,
        type: load.type,
        member: load.member,
        direction: load.direction || load.dir || null,
        expandedPointCount: rows.length,
        from: clamp(load.from ?? 0),
        to: clamp(load.to ?? 1),
      });
      handcalc.push(distributedHandcalc(load, rows));
    } else if (load.type === 'temperature' || load.type === 'tgradient') {
      if (load.type === 'temperature') featureCounts.temperature += 1;
      if (load.type === 'tgradient') featureCounts.temperatureGradient += 1;
      expanded.push({ ...load, sourceType: load.type });
      handcalc.push(temperatureHandcalc(load, model));
    } else if (load.type === 'mmoment') {
      featureCounts.memberMoment += 1;
      expanded.push({ ...load, sourceType: load.type });
      loadTrace.push({ id: load.id || null, type: load.type, member: load.member, at: Number(load.at ?? 0.5), axis: load.axis || 'z', moment: Number(load.M || 0) });
    }
    else expanded.push(load);
  }
  const features = {
    ...featureCounts,
    springSupports: countSpringSupports(model),
    settlements: countSettlements(model),
    trussMembers: countMembersByType(model, ['truss']),
    tensionOnlyMembers: countMembersByType(model, ['tensionOnly']),
    compressionOnlyMembers: countMembersByType(model, ['compressionOnly']),
    memberOffsets: countMemberOffsets(model),
  };
  const supportTrace = buildSupportTrace(model);
  const memberTrace = buildMemberTrace(model, lengths);
  warnings.push(...buildMemberOffsetWarnings(memberTrace));
  return {
    loads: expanded,
    trace: {
      version: ELASTIC_EXPANSION_VERSION,
      contract: {
        milestone: 'P3-M11',
        tickets: ['P3-T68', 'P3-T69', 'P3-T70', 'P3-T71', 'P3-T72'],
        scope: ['spring-supports', 'settlement', 'truss-and-unilateral-members', 'member-end-offsets', 'advanced-member-loads', 'thermal-loads'],
        signConventionRef: 'src/core/signConvention.js',
        featureTicketMap: {
          springSupports: 'P3-T68',
          settlements: 'P3-T68',
          trussMembers: 'P3-T69',
          tensionOnlyMembers: 'P3-T69',
          compressionOnlyMembers: 'P3-T69',
          memberOffsets: 'P3-T70',
          partialDistributed: 'P3-T71',
          trapezoid: 'P3-T71',
          memberMoment: 'P3-T71',
          temperature: 'P3-T72',
          temperatureGradient: 'P3-T72',
        },
        reviewFields: ['features', 'supportTrace', 'memberTrace', 'loadTrace', 'handcalc'],
        limitations: [
          'unilateral-member-state-is-load-combination-specific',
          'cable-sag-and-large-displacement-cable-effects-not-included',
          'construction-sequence-and-prestress-not-included',
        ],
      },
      inputCount: loads.length,
      outputCount: expanded.length,
      warnings,
      modelMembers: model.members?.length || 0,
      features,
      supportTrace,
      memberTrace,
      loadTrace,
      handcalc: handcalc.filter(Boolean),
      review: buildExpansionReview({ features, warnings, supportTrace, memberTrace, loadTrace, handcalc: handcalc.filter(Boolean) }),
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
    out.push({ ...load, id: `${load.id || 'LD'}_${i + 1}`, type: 'point', P: w * (b - a) * length, t, sourceType: load.type, sourceRange: { from, to, a, b } });
  }
  return out;
}

function distributedHandcalc(load, rows) {
  const totalLoad = rows.reduce((sum, row) => sum + Number(row.P || 0), 0);
  const weighted = rows.reduce((sum, row) => sum + Number(row.P || 0) * Number(row.t || 0), 0);
  return {
    id: load.id || null,
    type: load.type,
    member: load.member,
    direction: load.direction || load.dir || null,
    range: { from: clamp(load.from ?? 0), to: clamp(load.to ?? 1) },
    method: 'segmented-fixed-end-equivalent-point-loads',
    totalLoad,
    pointCount: rows.length,
    centroid: Math.abs(totalLoad) > 1e-12 ? weighted / totalLoad : null,
  };
}

function temperatureHandcalc(load, model) {
  const member = (model.members || []).find((item) => item.id === load.member);
  if (!member) return null;
  const material = materialOf(model, member.matId);
  const section = sectionOf(model, member.secId);
  const alpha = Number(load.alpha ?? material.alpha ?? 1.2e-5);
  if (load.type === 'temperature') {
    return { id: load.id || null, type: load.type, member: load.member, method: 'N=E*A*alpha*dT', axialForce: Number(material.E || 0) * Number(section.A || 0) * alpha * Number(load.dT || 0), E: material.E, A: section.A, alpha, dT: Number(load.dT || 0) };
  }
  const h = Math.max(1e-9, Number(load.h || section.H || 1));
  const curvature = alpha * (Number(load.dTtop || 0) - Number(load.dTbot || 0)) / h;
  return { id: load.id || null, type: load.type, member: load.member, method: 'M=E*Iz*alpha*(dTtop-dTbot)/h', moment: Number(material.E || 0) * Number(section.Iz || 0) * curvature, E: material.E, Iz: section.Iz, alpha, h, curvature };
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
      spring: pickFinite(node.spring, ['kx', 'ky', 'kz', 'krx', 'kry', 'krz']),
      settlement: pickFinite(node.settlement, ['ux', 'uy', 'uz', 'rx', 'ry', 'rz', 'kx', 'ky', 'kz', 'krx', 'kry', 'krz']),
      settlementForce: buildSettlementForceTrace(node),
    }));
}

function buildSettlementForceTrace(node) {
  const stiffnessKeys = ['kx', 'ky', 'kz', 'krx', 'kry', 'krz'];
  const settlementKeys = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  const out = {};
  for (let i = 0; i < stiffnessKeys.length; i += 1) {
    const k = Number(node.spring?.[stiffnessKeys[i]] || 0);
    const imposed = Number(node.settlement?.[stiffnessKeys[i]] ?? node.settlement?.[settlementKeys[i]] ?? 0);
    if (Number.isFinite(k) && k > 0 && Number.isFinite(imposed) && imposed !== 0) out[stiffnessKeys[i]] = k * imposed;
  }
  return out;
}

function buildMemberTrace(model = {}, lengths = {}) {
  return (model.members || [])
    .filter((member) => ['truss', 'tensionOnly', 'compressionOnly'].includes(member.type || member.behavior) || member.endOffset)
    .map((member) => ({
      member: member.id,
      behavior: member.type || member.behavior || 'frame',
      endOffset: member.endOffset || null,
      grossLength: lengths[member.id] ?? null,
      clearLength: clearLength(member, lengths[member.id]),
      offset: {
        i: Number(member.endOffset?.i || 0),
        j: Number(member.endOffset?.j || 0),
        rigidFactor: Number(member.endOffset?.rigidFactor ?? 1),
      },
    }));
}

function buildMemberOffsetWarnings(memberTrace = []) {
  return memberTrace
    .filter((row) => row.endOffset && Number(row.clearLength) <= 0)
    .map((row) => ({
      code: 'MEMBER_OFFSET_CLEAR_LENGTH_ZERO',
      member: row.member,
      message: 'Member end offsets reduce the clear length to zero; solver may ignore or clamp the offset.',
      grossLength: row.grossLength,
      clearLength: row.clearLength,
      offset: row.offset,
    }));
}

function clearLength(member, grossLength) {
  if (!Number.isFinite(grossLength)) return null;
  const offset = member.endOffset || {};
  return Math.max(0, grossLength - Number(offset.i || 0) - Number(offset.j || 0));
}

function pickFinite(source = {}, keys = []) {
  const out = {};
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function buildExpansionReview(input) {
  const features = input.features || {};
  const blockers = [];
  const settlementForceTraceReady = hasSettlementForceTrace(input.supportTrace || []);
  if (!settlementForceTraceReady) blockers.push('settlement-force-trace-missing');
  const advancedLoadCount = (features.partialDistributed || 0) + (features.trapezoid || 0) + (features.temperature || 0) + (features.temperatureGradient || 0);
  if (advancedLoadCount > 0 && !(input.handcalc || []).length) blockers.push('advanced-load-handcalc-missing');
  if ((input.warnings || []).length) blockers.push('elastic-expansion-warnings-present');
  if ((input.warnings || []).some((warning) => warning.code === 'MEMBER_OFFSET_CLEAR_LENGTH_ZERO')) blockers.push('member-offset-clear-length-invalid');
  const unilateralMemberCount = (features.tensionOnlyMembers || 0) + (features.compressionOnlyMembers || 0);
  return {
    traceReady: blockers.length === 0,
    settlementForceTraceReady,
    advancedLoadHandcalcReady: advancedLoadCount === 0 || (input.handcalc || []).length > 0,
    unilateralEnvelopeReviewRequired: unilateralMemberCount > 0,
    memberOffsetReviewRequired: (features.memberOffsets || 0) > 0,
    engineerReviewRequired: true,
    productionReady: false,
    blockers,
    agentDecision: blockers.length
      ? 'fix-elastic-expansion-trace-before-review'
      : 'elastic-expansion-ready-for-engineering-review',
  };
}

function hasSettlementForceTrace(supportTrace) {
  const settlementRows = supportTrace.filter((row) => (row.settlementKeys || []).length);
  if (!settlementRows.length) return true;
  return settlementRows.every((row) => Object.keys(row.settlementForce || {}).length > 0);
}
