export const MATERIAL_SCHEMA_VERSION = 'p3-m10-material-schema-v1';

export function validateMaterialRecord(record = {}) {
  const errors = [];
  if (!record.id) errors.push('id');
  if (!Number.isInteger(Number(record.version)) || Number(record.version) < 1) errors.push('version');
  const elastic = record.elastic || record;
  for (const key of ['E', 'G']) if (!positive(elastic[key])) errors.push(`elastic.${key}`);
  const kind = record.kind || inferKind(record);
  if (!['steel', 'concrete', 'timber', 'custom'].includes(kind)) errors.push('kind');
  const nonlinear = record.nonlinear;
  if (nonlinear && !validateBackbone(nonlinear.backbone || [])) errors.push('nonlinear.backbone');
  return { ok: errors.length === 0, errors, normalized: normalizeMaterialRecord(record) };
}

export function normalizeMaterialRecord(record = {}) {
  const elastic = record.elastic || record;
  const strength = record.strength || {};
  return {
    ...record,
    kind: record.kind || inferKind(record),
    elastic: {
      E: elastic.E, G: elastic.G, nu: elastic.nu ?? null,
      rho: elastic.rho ?? elastic.density ?? record.density ?? null,
      alpha: elastic.alpha ?? null,
    },
    strength,
    nonlinear: record.nonlinear || defaultNonlinear(record),
  };
}

function validateBackbone(rows) {
  return Array.isArray(rows) && rows.length >= 2 && rows.every((row) => (
    Number.isFinite(row.strain ?? row.rotation) && Number.isFinite(row.stress ?? row.moment)
  ));
}
function defaultNonlinear(record) {
  const fy = record.Fy || record.strength?.steel?.Fy || record.strength?.concrete?.fck;
  if (!fy) return null;
  return { model: 'bilinear', hardeningRatio: 0.02, ultimateDuctility: 9, backbone: [{ strain: 0, stress: 0 }, { strain: 0.002, stress: fy }] };
}
function inferKind(record) {
  const text = `${record.id || ''} ${record.name || ''}`.toLowerCase();
  if (text.includes('concrete') || text.includes('fc')) return 'concrete';
  if (text.includes('wood') || text.includes('timber')) return 'timber';
  return 'steel';
}
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
