export const LOAD_CASE_METADATA_VERSION = 'p7-m4-load-case-metadata-v1';

export const LOAD_INPUT_STATES = Object.freeze([
  'unconfigured',
  'candidate',
  'confirmed',
  'not-applicable',
  'unsupported',
  'invalid',
]);

export const LOAD_FAMILY_DEFINITIONS = Object.freeze([
  family('D', 'Dead load', 'dead', ['strength', 'service', 'mass', 'p-delta', 'foundation']),
  family('L', 'Live load', 'live', ['strength', 'service', 'mass', 'p-delta']),
  family('Lr', 'Roof live load', 'roofLive', ['strength', 'service']),
  family('S', 'Snow load', 'snow', ['strength', 'service', 'foundation']),
  family('R', 'Rain load', 'rain', ['strength', 'service']),
  family('W', 'Wind load', 'wind', ['strength', 'service', 'drift', 'p-delta', 'foundation', 'uplift'], true),
  family('E', 'Seismic load', 'seismic', ['strength', 'service', 'drift', 'p-delta', 'foundation', 'uplift'], true),
  family('H', 'Earth pressure load', 'earthPressure', ['strength', 'service', 'foundation']),
  family('T', 'Temperature load', 'temperature', ['strength', 'service']),
  family('F', 'Fluid load', 'fluid', ['strength', 'service', 'foundation', 'uplift']),
  family('EQUIPMENT', 'Equipment load', 'equipment', ['strength', 'service', 'mass', 'p-delta']),
  family('CONSTRUCTION', 'Construction load', 'construction', ['strength', 'service']),
  family('OTHER', 'Other load', 'other', []),
]);

export const LOAD_FAMILIES = Object.freeze(LOAD_FAMILY_DEFINITIONS.map((item) => item.id));

const FAMILY_BY_ID = new Map(LOAD_FAMILY_DEFINITIONS.map((item) => [item.id.toUpperCase(), item]));

const TYPE_FAMILY_ALIASES = Object.freeze({
  dead: 'D',
  live: 'L',
  roof: 'Lr',
  rooflive: 'Lr',
  roof_live: 'Lr',
  'roof-live': 'Lr',
  snow: 'S',
  rain: 'R',
  wind: 'W',
  seismic: 'E',
  earthquake: 'E',
  earthpressure: 'H',
  'earth-pressure': 'H',
  temperature: 'T',
  fluid: 'F',
  equipment: 'EQUIPMENT',
  construction: 'CONSTRUCTION',
  other: 'OTHER',
  user: 'OTHER',
});

export function normalizeLoadFamily(value, fallback = 'OTHER') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const compact = raw.replace(/[\s_-]+/g, '').toUpperCase();
  if (compact === 'LR' || compact === 'ROOFLIVE' || compact === 'ROOF') return 'Lr';
  if (compact === 'EARTHQUAKE' || compact === 'SEISMIC') return 'E';
  if (compact === 'EARTHPRESSURE' || compact === 'SOIL') return 'H';
  if (compact === 'TEMP' || compact === 'TEMPERATURE') return 'T';
  if (compact === 'RAIN') return 'R';
  const matched = FAMILY_BY_ID.get(compact);
  return matched?.id || fallback;
}

export function inferLoadCaseFamily(loadCase = {}) {
  const explicit = String(loadCase.family || '').trim();
  if (explicit) return normalizeLoadFamily(explicit);

  const type = String(loadCase.type || '').trim().toLowerCase();
  const typeFamily = TYPE_FAMILY_ALIASES[type] || TYPE_FAMILY_ALIASES[type.replace(/[\s_-]+/g, '')];
  if (typeFamily && typeFamily !== 'OTHER') return typeFamily;

  const id = String(loadCase.id || '').trim();
  const idFamily = familyFromCaseId(id);
  if (idFamily) return idFamily;

  return typeFamily || 'OTHER';
}

export function normalizeLoadCaseMetadata(loadCase = {}, options = {}) {
  const familyId = inferLoadCaseFamily(loadCase);
  const definition = getLoadFamilyDefinition(familyId);
  const id = String(loadCase.id || options.id || familyId).trim();
  const direction = normalizeDirection(loadCase.direction ?? directionFromCaseId(id));
  const sign = normalizeSign(loadCase.sign ?? signFromCaseId(id));
  const variant = String(loadCase.variant || variantFromCaseId(id, familyId) || 'default');
  const purposes = uniqueStrings(loadCase.purposes || loadCase.purpose || definition.purposes);
  const sourceId = String(loadCase.sourceId || options.sourceId || '').trim() || null;
  const origin = String(loadCase.origin || options.origin || 'manual');
  const generatedKey = loadCase.generatedKey || (sourceId
    ? loadCaseGeneratedKey({ id, family: familyId, direction, sign, variant, sourceId })
    : null);

  const inputState = normalizeLoadInputState(loadCase.inputState || options.inputState, loadCase.value);
  return {
    ...clonePlain(loadCase),
    id,
    name: String(loadCase.name || options.name || definition.label || id),
    type: String(loadCase.type || definition.legacyType || 'other'),
    metadataVersion: LOAD_CASE_METADATA_VERSION,
    family: familyId,
    direction,
    sign,
    variant,
    purposes,
    purpose: purposes[0] || null,
    origin,
    sourceId,
    generatedKey,
    userModified: loadCase.userModified === true,
    status: normalizeEvidenceStatus(loadCase.status || options.status || (origin === 'manual' ? 'preliminary' : 'candidate')),
    inputState,
    confirmation: loadCase.confirmation || confirmationFromInputState(inputState),
  };
}

export function loadCaseGeneratedKey(loadCase = {}) {
  const familyId = normalizeLoadFamily(loadCase.family || inferLoadCaseFamily(loadCase));
  const sourceId = stableToken(loadCase.sourceId || 'manual');
  const id = stableToken(loadCase.id || familyId);
  const direction = stableToken(normalizeDirection(loadCase.direction) || 'none');
  const sign = normalizeSign(loadCase.sign);
  const signToken = sign === 1 ? 'positive' : sign === -1 ? 'negative' : 'unsigned';
  const variant = stableToken(loadCase.variant || 'default');
  return `load-case:${sourceId}:${stableToken(familyId)}:${id}:${direction}:${signToken}:${variant}`;
}

export function loadCaseLogicalKey(loadCase = {}) {
  return loadCase.generatedKey || loadCaseGeneratedKey({
    ...loadCase,
    sourceId: loadCase.sourceId || 'logical',
  });
}

export function getLoadFamilyDefinition(familyId) {
  const normalized = normalizeLoadFamily(familyId);
  const found = LOAD_FAMILY_DEFINITIONS.find((item) => item.id === normalized);
  return clonePlain(found || LOAD_FAMILY_DEFINITIONS[LOAD_FAMILY_DEFINITIONS.length - 1]);
}

export function normalizeLoadInputState(value, numericValue) {
  const normalized = String(value || '').trim().toLowerCase();
  if (LOAD_INPUT_STATES.includes(normalized)) return normalized;
  if (numericValue == null || numericValue === '') return 'unconfigured';
  return Number.isFinite(Number(numericValue)) ? 'confirmed' : 'invalid';
}

export function normalizeDirection(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[+\-]/g, '');
  if (['x', 'global-x', 'globalx'].includes(raw)) return 'x';
  if (['y', 'global-y', 'globaly'].includes(raw)) return 'y';
  if (['z', 'global-z', 'globalz'].includes(raw)) return 'z';
  return raw || null;
}

export function normalizeSign(value) {
  if (value === 1 || value === '+1') return 1;
  if (value === -1 || value === '-1') return -1;
  const raw = String(value || '').trim().toLowerCase();
  if (['+', 'positive', 'plus', 'pos'].includes(raw)) return 1;
  if (['-', 'negative', 'minus', 'neg'].includes(raw)) return -1;
  return null;
}

function family(id, label, legacyType, purposes, multi = false) {
  return Object.freeze({ id, label, legacyType, purposes: Object.freeze(purposes.slice()), multi });
}

function familyFromCaseId(value) {
  const id = String(value || '').trim();
  if (!id) return null;
  const upper = id.toUpperCase();
  if (/^LR(?:$|[+\-_:])/i.test(id)) return 'Lr';
  if (/^EQUIPMENT(?:$|[+\-_:])/i.test(id)) return 'EQUIPMENT';
  if (/^CONSTRUCTION(?:$|[+\-_:])/i.test(id)) return 'CONSTRUCTION';
  for (const familyId of ['D', 'L', 'S', 'R', 'W', 'E', 'H', 'T', 'F']) {
    if (upper === familyId || new RegExp(`^${familyId}(?:[+\\-_:]|[XYZ](?:$|[+\\-_:]))`).test(upper)) return familyId;
  }
  return null;
}

function directionFromCaseId(value) {
  const id = String(value || '').toUpperCase();
  const match = id.match(/(?:^|[+\-_:])([XYZ])(?:$|[+\-_:])/)
    || id.match(/^[WE]([XYZ])/);
  return match ? match[1].toLowerCase() : null;
}

function signFromCaseId(value) {
  const id = String(value || '').toUpperCase();
  if (/(?:^|[_:])(?:NEG|MINUS)(?:$|[_:])/.test(id) || /-[XYZ]$/.test(id) || /[XYZ]-$/.test(id)) return -1;
  if (/(?:^|[_:])(?:POS|PLUS)(?:$|[_:])/.test(id) || /\+[XYZ]$/.test(id) || /[XYZ]\+$/.test(id)) return 1;
  return null;
}

function variantFromCaseId(value, familyId) {
  const id = String(value || '').toUpperCase();
  if (familyId === 'D' && /(?:^|[-_:])SW(?:$|[-_:])/.test(id)) return 'selfWeight';
  if (familyId === 'D' && /(?:^|[-_:])SDL(?:$|[-_:])/.test(id)) return 'superimposed';
  return null;
}

function normalizeEvidenceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['verified', 'candidate', 'preliminary', 'unsupported', 'invalid'].includes(normalized)) return normalized;
  return 'candidate';
}

function confirmationFromInputState(state) {
  if (state === 'confirmed') return 'confirmed';
  if (state === 'not-applicable') return 'not-applicable';
  return 'unconfirmed';
}

function uniqueStrings(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function stableToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'none';
}

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}
