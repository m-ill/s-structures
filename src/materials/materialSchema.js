export const MATERIAL_SCHEMA_VERSION = 'p3-m10-material-schema-v1';

export function validateMaterialRecord(record = {}) {
  const errors = [];
  const warnings = [];
  if (!record.id) errors.push('id');
  if (!Number.isInteger(Number(record.version)) || Number(record.version) < 1) errors.push('version');
  const elastic = record.elastic || record;
  for (const key of ['E', 'G']) if (!positive(elastic[key])) errors.push(`elastic.${key}`);
  const kind = record.kind || inferKind(record);
  if (!['steel', 'concrete', 'timber', 'custom'].includes(kind)) errors.push('kind');
  const strength = normalizeStrength(record, kind);
  errors.push(...validateStrength(kind, strength));
  warnings.push(...validateSourceTrace(kind, record));
  const nonlinear = record.nonlinear;
  if (nonlinear && !validateBackbone(nonlinear.backbone || [])) errors.push('nonlinear.backbone');
  return { ok: errors.length === 0, errors, warnings, normalized: normalizeMaterialRecord(record) };
}

export function normalizeMaterialRecord(record = {}) {
  const elastic = record.elastic || record;
  const kind = record.kind || inferKind(record);
  const strength = normalizeStrength(record, kind);
  return {
    ...record,
    kind,
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
  if (!Array.isArray(rows) || rows.length < 2) return false;
  let lastX = -Infinity;
  for (const row of rows) {
    const x = row.strain ?? row.rotation;
    const y = row.stress ?? row.moment;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x <= lastX) return false;
    lastX = x;
  }
  return true;
}
function validateStrength(kind, strength = {}) {
  const errors = [];
  if (kind === 'steel') {
    if (!positive(strength.steel?.Fy)) errors.push('strength.steel.Fy');
    if (!positive(strength.steel?.Fu)) errors.push('strength.steel.Fu');
  }
  if (kind === 'concrete' && !positive(strength.concrete?.fck)) errors.push('strength.concrete.fck');
  return errors;
}
function validateSourceTrace(kind, record) {
  if (kind !== 'custom') return [];
  return record.source?.note ? [] : ['source.note-missing-for-custom-material'];
}
function normalizeStrength(record, kind) {
  const strength = { ...(record.strength || {}) };
  if (kind === 'steel') {
    strength.steel = {
      ...(strength.steel || {}),
      Fy: strength.steel?.Fy ?? record.Fy ?? record.fy ?? null,
      Fu: strength.steel?.Fu ?? record.Fu ?? record.fu ?? null,
    };
  }
  if (kind === 'concrete') {
    strength.concrete = {
      ...(strength.concrete || {}),
      fck: strength.concrete?.fck ?? record.fck ?? record.Fck ?? null,
      fy_rebar: strength.concrete?.fy_rebar ?? record.fy_rebar ?? record.fyRebar ?? null,
    };
  }
  return strength;
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
