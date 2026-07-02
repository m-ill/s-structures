export const SECTION_PROPERTIES_VERSION = 'p3-m10-section-properties';

export function computeSectionProperties(shape, params = {}) {
  const s = String(shape || '').toUpperCase();
  if (s === 'H') return hSection(params);
  if (s === 'BOX') return boxSection(params);
  if (s === 'PIPE') return pipeSection(params);
  if (s === 'RECT') return rectSection(params);
  if (s === 'CIRC') return circSection(params);
  return null;
}

function hSection({ H, B, tw, tf }) {
  const h = H / 1000; const b = B / 1000; const web = tw / 1000; const fl = tf / 1000;
  const A = 2 * b * fl + web * Math.max(0, h - 2 * fl);
  const Iz = (b * h ** 3 - (b - web) * Math.max(0, h - 2 * fl) ** 3) / 12;
  const Iy = (2 * fl * b ** 3 + Math.max(0, h - 2 * fl) * web ** 3) / 12;
  return finish({ A, Iy, Iz, J: (2 * b * fl ** 3 + Math.max(0, h - 2 * fl) * web ** 3) / 3, H: h, B: b });
}

function boxSection({ H, B, t }) {
  const h = H / 1000; const b = B / 1000; const th = t / 1000;
  const hi = Math.max(0, h - 2 * th); const bi = Math.max(0, b - 2 * th);
  return finish({ A: b * h - bi * hi, Iy: (h * b ** 3 - hi * bi ** 3) / 12, Iz: (b * h ** 3 - bi * hi ** 3) / 12, J: 2 * th * (b - th) ** 2 * (h - th) ** 2 / Math.max(1e-12, b + h - 2 * th), H: h, B: b });
}

function pipeSection({ D, t }) {
  const d = D / 1000; const di = Math.max(0, d - 2 * t / 1000);
  const A = Math.PI * (d ** 2 - di ** 2) / 4;
  const I = Math.PI * (d ** 4 - di ** 4) / 64;
  return finish({ A, Iy: I, Iz: I, J: 2 * I, H: d, B: d });
}

function rectSection({ B, H }) {
  const b = B / 1000; const h = H / 1000;
  return finish({ A: b * h, Iy: h * b ** 3 / 12, Iz: b * h ** 3 / 12, J: b * h * (b ** 2 + h ** 2) / 12, H: h, B: b });
}

function circSection({ D }) {
  const d = D / 1000; const A = Math.PI * d ** 2 / 4; const I = Math.PI * d ** 4 / 64;
  return finish({ A, Iy: I, Iz: I, J: 2 * I, H: d, B: d });
}

function finish(p) {
  return { ...p, Zy: p.Iy && p.B ? p.Iy / (p.B / 2) : 0, Zz: p.Iz && p.H ? p.Iz / (p.H / 2) : 0, ry: Math.sqrt(p.Iy / p.A), rz: Math.sqrt(p.Iz / p.A) };
}
