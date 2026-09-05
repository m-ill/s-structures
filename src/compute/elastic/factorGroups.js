import { stableHash } from '../../core/stableHash.js';
import { resolveGlobalShearDeformation, resolveMemberShearDeformationSetting } from '../../core/shearDeformation.js';

export const ELASTIC_FACTOR_GROUP_VERSION = 'p14-m1-elastic-factor-groups-v2-foundation';

export function classifyElasticFactorGroups(model = {}, combinations = [], options = {}) {
  const combos = Array.isArray(combinations) ? combinations : [];
  const unilateralMemberIds = (model.members || [])
    .filter((member) => ['tensionOnly', 'compressionOnly'].includes(member.behavior || member.type))
    .map((member) => String(member.id))
    .sort();
  const pDeltaMethod = normalizedPDeltaMethod(model.analysisSettings || {}, options);
  const baseStiffnessHash = stableHash(stiffnessIdentity(model));
  const rows = combos.map((combo, index) => {
    const invalidation = [];
    if (unilateralMemberIds.length) invalidation.push('unilateral-active-set');
    if (pDeltaMethod === 'direct') invalidation.push('direct-pdelta-tangent');
    const shareable = invalidation.length === 0;
    const factorKey = stableHash({
      version: ELASTIC_FACTOR_GROUP_VERSION,
      baseStiffnessHash,
      mode: pDeltaMethod === 'direct' ? 'direct-pdelta' : 'linear-static',
      isolation: shareable ? null : String(combo.id || index),
      invalidation,
    });
    return Object.freeze({
      comboId: String(combo.id || `combo-${index + 1}`),
      factorKey,
      shareable,
      invalidation: Object.freeze(invalidation),
      settlementAffectsRhsOnly: hasSettlement(model),
      unilateralMemberIds: Object.freeze([...unilateralMemberIds]),
    });
  });
  const groupMap = new Map();
  for (const row of rows) {
    const group = groupMap.get(row.factorKey) || {
      id: `FG-${groupMap.size + 1}`,
      factorKey: row.factorKey,
      comboIds: [],
      shareable: row.shareable,
      invalidation: row.invalidation,
    };
    group.comboIds.push(row.comboId);
    groupMap.set(row.factorKey, group);
  }
  const groups = [...groupMap.values()].map((group) => Object.freeze({
    ...group,
    comboIds: Object.freeze(group.comboIds),
  }));
  return Object.freeze({
    version: ELASTIC_FACTOR_GROUP_VERSION,
    baseStiffnessHash,
    pDeltaMethod,
    combinationCount: rows.length,
    groupCount: groups.length,
    rows: Object.freeze(rows),
    groups: Object.freeze(groups),
    comboToFactorKey: Object.freeze(Object.fromEntries(rows.map((row) => [row.comboId, row.factorKey]))),
    rules: Object.freeze({
      settlement: 'rhs-only-reuse-allowed',
      unilateral: 'isolate-until-active-set-converges',
      directPDelta: 'invalidate-on-every-tangent-rebuild',
    }),
    planHash: stableHash({ baseStiffnessHash, rows: rows.map(serializableRow) }),
  });
}

export function elasticFactorKeyForCombo(plan, comboId) {
  const key = plan?.comboToFactorKey?.[comboId];
  if (!key) throw factorGroupError('ELASTIC_FACTOR_GROUP_MISSING', `No factor group exists for combination ${comboId}.`);
  return key;
}

function stiffnessIdentity(model) {
  const globalShearDeformation = resolveGlobalShearDeformation(model);
  return {
    analysisSettings: {
      shearDeformation: globalShearDeformation,
    },
    nodes: (model.nodes || []).map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      z: node.z || 0,
      support: node.support || null,
      spring: node.spring || null,
      panelZone: node.panelZone || null,
    })),
    members: (model.members || []).map((member) => ({
      id: member.id,
      n1: member.n1,
      n2: member.n2,
      matId: member.matId,
      secId: member.secId,
      behavior: member.behavior || member.type || 'frame',
      releases: member.releases || member.release || null,
      endOffset: member.endOffset || null,
      insertionPoint: member.insertionPoint || null,
      taper: member.taper || null,
      localAxis: member.localAxis || null,
      customProps: member.customProps || null,
      foundationId: member.foundationId || null,
      shearDeformation: memberShearDeformationIdentity(model, member),
    })),
    materials: model.materials || [],
    sections: model.sections || [],
    foundationProperties: model.foundationProperties || [],
    rigidDiaphragms: model.rigidDiaphragms || [],
    constraints: model.constraints || [],
    semiRigidDiaphragms: model.semiRigidDiaphragms || [],
    walls: model.walls || [],
    slabs: model.slabs || [],
  };
}

function memberShearDeformationIdentity(model, member) {
  const behavior = member.behavior || member.type || 'frame';
  if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    return { requested: false, source: 'not-applicable-axial-only', override: null };
  }
  const resolved = resolveMemberShearDeformationSetting(model, member);
  return {
    requested: resolved.requested,
    source: resolved.settingSource,
    override: resolved.override,
  };
}

function normalizedPDeltaMethod(settings, options) {
  const requested = String(options.pDeltaMethod ?? settings.pDeltaMethod ?? '').trim().toLowerCase();
  if (requested === 'direct') return 'direct';
  if (requested === 'legacy' || settings.includeGeometricStiffness === true) return 'legacy';
  return 'off';
}

function hasSettlement(model) {
  return (model.nodes || []).some((node) => node.settlement && Object.keys(node.settlement).length > 0);
}

function serializableRow(row) {
  return {
    comboId: row.comboId,
    factorKey: row.factorKey,
    shareable: row.shareable,
    invalidation: [...row.invalidation],
  };
}

function factorGroupError(code, message) {
  return Object.assign(new Error(message), { code });
}
