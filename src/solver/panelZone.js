export const PANEL_ZONE_VERSION = 'p10-m4-panel-zone-v1';
export const PANEL_ZONE_AXES = Object.freeze(['y', 'z']);

export function validatePanelZoneInput(value, nodeId = null) {
  if (value == null) return { ok: true, enabled: false };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return failure('BAD_PANEL_ZONE', nodeId, 'joint.panelZone must be an object.');
  }
  const unknown = Object.keys(value).filter((key) => !['tp', 'db', 'dc', 'axis'].includes(key));
  if (unknown.length) return failure('BAD_PANEL_ZONE', nodeId, `Unsupported panel-zone field: ${unknown[0]}.`);
  for (const key of ['tp', 'db', 'dc']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || !(value[key] > 0)) {
      return failure('BAD_PANEL_ZONE', nodeId, `joint.panelZone.${key} must be a positive finite number.`);
    }
  }
  if (value.axis != null && !PANEL_ZONE_AXES.includes(value.axis)) {
    return failure('BAD_PANEL_ZONE', nodeId, 'joint.panelZone.axis must be y or z when specified.');
  }
  return {
    ok: true,
    enabled: true,
    tp: value.tp,
    db: value.db,
    dc: value.dc,
    axis: value.axis || null,
  };
}

export function applyPanelZoneConnectionSprings(member = {}, endNodes = {}, material = {}) {
  const springs = { ...(member.releases?.spring || {}) };
  const sources = {};
  const rows = [];
  for (const [end, suffix] of [['i', 'I'], ['j', 'J']]) {
    const node = endNodes[end];
    const checked = validatePanelZoneInput(node?.panelZone, node?.id || null);
    if (!checked.ok) return { ...checked, memberId: member.id || null };
    if (!checked.enabled) continue;
    const G = Number(material.G);
    if (!(G > 0) || !Number.isFinite(G)) {
      return failure('PANEL_ZONE_MATERIAL_G_REQUIRED', node?.id, 'Panel-zone stiffness requires positive finite material G.', member.id);
    }
    const axis = checked.axis || (member.localAxis?.strongAxis === 'y' ? 'y' : 'z');
    const key = `r${axis}${suffix}`;
    if (Object.prototype.hasOwnProperty.call(springs, key)) {
      return failure(
        'PANEL_ZONE_SPRING_CONFLICT',
        node?.id,
        `Panel zone and explicit member spring both assign ${key}.`,
        member.id,
      );
    }
    const stiffness = G * checked.tp * checked.db * checked.dc;
    springs[key] = stiffness;
    sources[key] = 'panelZone';
    rows.push({
      version: PANEL_ZONE_VERSION,
      source: 'panelZone',
      nodeId: node.id,
      memberId: member.id || null,
      end,
      axis,
      key,
      stiffness,
      formula: 'K_pz=G*tp*db*dc',
      inputs: { G, tp: checked.tp, db: checked.db, dc: checked.dc },
    });
  }
  if (!rows.length) return { ok: true, applied: false, member, sources, rows };
  return {
    ok: true,
    applied: true,
    member: {
      ...member,
      releases: { ...(member.releases || {}), spring: springs },
    },
    sources,
    rows,
  };
}

export function attachPanelZoneSources(partialFixity, connection) {
  if (!partialFixity || !connection?.applied) return partialFixity;
  return {
    ...partialFixity,
    entries: (partialFixity.entries || []).map((entry) => ({
      ...entry,
      source: connection.sources?.[entry.key] || entry.source || 'member',
    })),
    panelZone: {
      version: PANEL_ZONE_VERSION,
      applied: true,
      rows: connection.rows.map((row) => ({ ...row })),
    },
  };
}

function failure(reason, nodeId, message, memberId = null) {
  return { ok: false, reason, nodeId, memberId, message };
}
