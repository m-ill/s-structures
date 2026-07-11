export const SECTION_PROPERTIES_VERSION = 'p3-m10-section-properties';

const OUTPUT_UNITS = Object.freeze({
  A: 'm2',
  Ay: 'm2',
  Az: 'm2',
  Iy: 'm4',
  Iz: 'm4',
  J: 'm4',
  Cw: 'm6',
});

export function computeSectionProperties(shape, params = {}) {
  const s = String(shape || '').trim().toUpperCase();
  const checked = validateSectionGeometry(s, params);
  if (!checked.ok) return null;
  if (s === 'H') return hSection(checked.params);
  if (s === 'BOX') return boxSection(checked.params);
  if (s === 'PIPE') return pipeSection(checked.params);
  if (s === 'RECT') return rectSection(checked.params, 'RECT');
  if (s === 'SQUARE') return rectSection({ B: checked.params.B, H: checked.params.B }, 'SQUARE');
  if (s === 'CIRC') return circSection(checked.params);
  return null;
}

export function validateSectionGeometry(shape, params = {}) {
  const s = String(shape || '').trim().toUpperCase();
  const normalized = normalizeParams(s, params);
  const errors = sectionGeometryErrors(s, normalized, params);
  return { ok: errors.length === 0, errors, params: normalized };
}

export function sectionGeometryErrors(shape, params = {}, originalParams = params) {
  const s = String(shape || '').trim().toUpperCase();
  const errors = [];
  if (s === 'SQUARE') {
    requirePositive(params, ['B'], errors);
    if (positive(originalParams.B) && positive(originalParams.H)
      && Math.abs(Number(originalParams.B) - Number(originalParams.H)) > 1e-9) {
      errors.push('params.square-side-mismatch');
    }
    return errors;
  }
  if (s === 'RECT') {
    requirePositive(params, ['B', 'H'], errors);
    return errors;
  }
  if (s === 'CIRC') {
    requirePositive(params, ['D'], errors);
    return errors;
  }
  if (s === 'PIPE') {
    requirePositive(params, ['D', 't'], errors);
    if (!errors.length && 2 * params.t >= params.D) errors.push('params.t-exceeds-pipe-radius');
    return errors;
  }
  if (s === 'BOX') {
    requirePositive(params, ['B', 'H', 't'], errors);
    if (!errors.length && (2 * params.t >= params.B || 2 * params.t >= params.H)) {
      errors.push('params.t-overlaps-box-walls');
    }
    return errors;
  }
  if (s === 'H') {
    requirePositive(params, ['H', 'B', 'tw', 'tf'], errors);
    if (!errors.length && 2 * params.tf >= params.H) errors.push('params.tf-overlaps-flanges');
    if (!errors.length && params.tw >= params.B) errors.push('params.tw-exceeds-flange-width');
    return errors;
  }
  return ['shape.unsupported'];
}

export function rectSaintVenantTorsionConstant(side1, side2) {
  const longSide = Math.max(Number(side1), Number(side2));
  const shortSide = Math.min(Number(side1), Number(side2));
  if (!(longSide > 0 && shortSide > 0)) return null;
  let series = 0;
  for (let odd = 1; odd <= 999; odd += 2) {
    series += Math.tanh((odd * Math.PI * longSide) / (2 * shortSide)) / odd ** 5;
  }
  const correction = (192 / Math.PI ** 5) * (shortSide / longSide) * series;
  return (longSide * shortSide ** 3 / 3) * (1 - correction);
}

function hSection({ H, B, tw, tf }) {
  const h = H / 1000;
  const b = B / 1000;
  const web = tw / 1000;
  const fl = tf / 1000;
  const clearWeb = h - 2 * fl;
  const A = 2 * b * fl + web * clearWeb;
  const Iz = (b * h ** 3 - (b - web) * clearWeb ** 3) / 12;
  const Iy = (2 * fl * b ** 3 + clearWeb * web ** 3) / 12;
  const J = (2 * b * fl ** 3 + clearWeb * web ** 3) / 3;
  const Cw = fl * b ** 3 * (h - fl) ** 2 / 24;
  return finish({ A, Iy, Iz, J, Cw, H: h, B: b }, 'H', 'composite-rectangles-open-section');
}

function boxSection({ H, B, t }) {
  const h = H / 1000;
  const b = B / 1000;
  const th = t / 1000;
  const hi = h - 2 * th;
  const bi = b - 2 * th;
  const A = b * h - bi * hi;
  const Iy = (h * b ** 3 - hi * bi ** 3) / 12;
  const Iz = (b * h ** 3 - bi * hi ** 3) / 12;
  const J = 2 * th * (b - th) ** 2 * (h - th) ** 2 / (b + h - 2 * th);
  return finish({ A, Iy, Iz, J, H: h, B: b }, 'BOX', 'uniform-thickness-bredt-batho');
}

function pipeSection({ D, t }) {
  const d = D / 1000;
  const di = d - 2 * t / 1000;
  const A = Math.PI * (d ** 2 - di ** 2) / 4;
  const I = Math.PI * (d ** 4 - di ** 4) / 64;
  return finish({ A, Iy: I, Iz: I, J: 2 * I, H: d, B: d }, 'PIPE', 'annulus-closed-form');
}

function rectSection({ B, H }, shape) {
  const b = B / 1000;
  const h = H / 1000;
  const A = b * h;
  return finish({
    A,
    Ay: 5 * A / 6,
    Az: 5 * A / 6,
    Iy: h * b ** 3 / 12,
    Iz: b * h ** 3 / 12,
    J: rectSaintVenantTorsionConstant(b, h),
    H: h,
    B: b,
  }, shape, 'solid-rectangle-saint-venant-series', { shearAreaMethod: '5A/6' });
}

function circSection({ D }) {
  const d = D / 1000;
  const A = Math.PI * d ** 2 / 4;
  const I = Math.PI * d ** 4 / 64;
  return finish({ A, Ay: 0.9 * A, Az: 0.9 * A, Iy: I, Iz: I, J: 2 * I, H: d, B: d }, 'CIRC', 'solid-circle-closed-form', {
    shearAreaMethod: '0.9A-engineering-approximation',
  });
}

function finish(properties, shape, formula, extraProvenance = {}) {
  return {
    ...properties,
    Zy: properties.Iy / (properties.B / 2),
    Zz: properties.Iz / (properties.H / 2),
    ry: Math.sqrt(properties.Iy / properties.A),
    rz: Math.sqrt(properties.Iz / properties.A),
    provenance: {
      source: 'computed-parametric',
      shape,
      formula,
      inputUnit: 'mm',
      outputUnits: OUTPUT_UNITS,
      ...extraProvenance,
    },
  };
}

function normalizeParams(shape, params) {
  const source = params || {};
  if (shape === 'SQUARE') {
    return { ...source, B: numberOrNull(source.B ?? source.side ?? source.H) };
  }
  const keys = {
    H: ['H', 'B', 'tw', 'tf'],
    BOX: ['H', 'B', 't'],
    PIPE: ['D', 't'],
    RECT: ['B', 'H'],
    CIRC: ['D'],
  }[shape] || [];
  return {
    ...source,
    ...Object.fromEntries(keys.map((key) => [key, numberOrNull(source[key])])),
  };
}

function requirePositive(params, keys, errors) {
  for (const key of keys) if (!positive(params[key])) errors.push(`params.${key}`);
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
