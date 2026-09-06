import { sectionOf } from '../core/catalogs.js';
import { stableHash } from '../core/stableHash.js';
import { resolveCriterion } from '../core/analysisCriteria.js';
import { resolveSectionShearAreas } from '../materials/sectionProperties.js';

export const TAPERED_MEMBER_VERSION = 'p10-m6-tapered-force-based-v1';
export const TAPER_PROFILES = Object.freeze(['linear', 'parabolic-depth', 'segments']);

const PROPERTY_KEYS = Object.freeze(['A', 'Ay', 'Az', 'Iy', 'Iz', 'J']);
const GAUSS = Object.freeze({
  5: Object.freeze([
    [-0.906179845938664, 0.2369268850561891],
    [-0.5384693101056831, 0.4786286704993665],
    [0, 0.5688888888888889],
    [0.5384693101056831, 0.4786286704993665],
    [0.906179845938664, 0.2369268850561891],
  ]),
  10: Object.freeze([
    [-0.9739065285171717, 0.06667134430868814],
    [-0.8650633666889845, 0.1494513491505806],
    [-0.6794095682990244, 0.219086362515982],
    [-0.4333953941292472, 0.2692667193099963],
    [-0.1488743389816312, 0.2955242247147529],
    [0.1488743389816312, 0.2955242247147529],
    [0.4333953941292472, 0.2692667193099963],
    [0.6794095682990244, 0.219086362515982],
    [0.8650633666889845, 0.1494513491505806],
    [0.9739065285171717, 0.06667134430868814],
  ]),
});

export function resolveMemberTaper(model = {}, member = {}, sectionI = {}, options = {}) {
  if (member.taper == null) return null;
  const input = member.taper;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failed('BAD_MEMBER_TAPER', 'member.taper must be an object.');
  const profile = String(input.profile || 'linear');
  if (!TAPER_PROFILES.includes(profile)) return failed('BAD_MEMBER_TAPER_PROFILE', `Unsupported taper profile: ${profile}.`);
  const gaussPoints = Number(input.gaussPoints ?? options.gaussPoints ?? resolveCriterion(model, 'taper.gaussPoints', 5));
  if (![5, 10].includes(gaussPoints)) return failed('BAD_MEMBER_TAPER_GAUSS_POINTS', 'taper.gaussPoints must be 5 or 10.');
  const getSection = options.section || ((id) => sectionOf(model, id));
  const sectionJId = input.sectionIdJ || member.secId;
  const sectionJ = flattenSection(getSection(sectionJId));
  const start = flattenSection(sectionI);
  if (!validSection(start) || !validSection(sectionJ)) return failed('BAD_MEMBER_TAPER_SECTION', 'Taper endpoint sections require positive A, Iy, Iz, and J.');
  let segments = [];
  if (profile === 'segments') {
    if (!Array.isArray(input.segments) || !input.segments.length) return failed('BAD_MEMBER_TAPER_SEGMENTS', 'Segmented taper requires a non-empty segments array.');
    segments = normalizeSegments(input.segments, getSection);
    if (!segments.ok) return segments;
    segments = segments.rows;
  }
  const contract = {
    version: TAPERED_MEMBER_VERSION,
    ok: true,
    profile,
    gaussPoints,
    sectionIdI: member.secId || start.id || null,
    sectionIdJ: sectionJId || sectionJ.id || null,
    start: propertySnapshot(start),
    end: propertySnapshot(sectionJ),
    segments,
    integration: 'force-based-flexibility-gauss-legendre',
  };
  return { ...contract, hash: stableHash(contract).slice(0, 24) };
}

export function taperedSectionAt(taper, xi) {
  if (!taper?.ok) return null;
  const s = Math.max(0, Math.min(1, Number(xi) || 0));
  if (taper.profile === 'segments') {
    const row = taper.segments.find((item, index) => s >= item.start && (s < item.end || index === taper.segments.length - 1));
    return { ...(row?.section || taper.end) };
  }
  if (taper.profile === 'parabolic-depth') return parabolicDepthSection(taper.start, taper.end, s);
  return interpolateSection(taper.start, taper.end, s);
}

export function localTaperedK12(material = {}, taper, length, options = {}) {
  const L = positive(length);
  const E = positive(material.E);
  const G = positive(material.G);
  if (!L || !E || !G || !taper?.ok) return failed('TAPERED_MEMBER_STIFFNESS_INVALID', 'Valid E, G, length, and taper contract are required.');
  const useShear = options.shearDeformation === true;
  const integrate = (fn) => integrateTaper(taper, L, fn);
  const axialFlexibility = integrate((section) => 1 / (E * section.A));
  const torsionFlexibility = integrate((section) => 1 / (G * section.J));
  if (options.axialOnly === true) {
    const k = zero12();
    addPair(k, 0, 6, 1 / axialFlexibility);
    return {
      ok: true,
      version: TAPERED_MEMBER_VERSION,
      kl: k,
      taper,
      length: L,
      shearDeformation: false,
      flexibility: { axial: axialFlexibility },
      integratedProperties: integrateTaperedProperties(taper, L),
    };
  }
  const bendingZ = bendingFlexibility(integrate, E, G, 'Iz', 'Ay', L, useShear);
  const bendingY = bendingFlexibility(integrate, E, G, 'Iy', 'Az', L, useShear);
  if (![axialFlexibility, torsionFlexibility, ...bendingZ.flat(), ...bendingY.flat()].every((value) => Number.isFinite(value))) {
    return failed('TAPERED_MEMBER_INTEGRATION_INVALID', 'Taper integration produced a non-finite flexibility.');
  }
  const k = zero12();
  addPair(k, 0, 6, 1 / axialFlexibility);
  addPair(k, 3, 9, 1 / torsionFlexibility);
  addBendingPlane(k, [1, 5, 7, 11], invert2(bendingZ), 1, L);
  addBendingPlane(k, [2, 4, 8, 10], invert2(bendingY), -1, L);
  return {
    ok: true,
    version: TAPERED_MEMBER_VERSION,
    kl: k,
    taper,
    length: L,
    shearDeformation: useShear,
    flexibility: { axial: axialFlexibility, torsion: torsionFlexibility, bendingY, bendingZ },
    integratedProperties: integrateTaperedProperties(taper, L),
  };
}

export function integrateTaperedProperties(taper, length) {
  const L = positive(length);
  const values = Object.fromEntries(PROPERTY_KEYS.map((key) => [key, integrateTaper(taper, L, (section) => section[key])]));
  return {
    ...values,
    average: Object.fromEntries(PROPERTY_KEYS.map((key) => [key, values[key] / L])),
    length: L,
  };
}

export function taperedMemberMass(material = {}, taper, length) {
  const density = Math.max(0, Number(material.density ?? material.rho) || 0);
  return density * integrateTaper(taper, positive(length), (section) => section.A);
}

function bendingFlexibility(integrate, E, G, inertiaKey, shearKey, L, useShear) {
  const f11 = integrate((section, s) => ((1 - s) ** 2) / (E * section[inertiaKey]));
  const f12 = integrate((section, s) => (-(1 - s) * s) / (E * section[inertiaKey]));
  const f22 = integrate((section, s) => (s ** 2) / (E * section[inertiaKey]));
  if (!useShear) return [[f11, f12], [f12, f22]];
  const shear = integrate((section) => 1 / (G * section[shearKey] * L ** 2));
  return [[f11 + shear, f12 + shear], [f12 + shear, f22 + shear]];
}

function addBendingPlane(k, dofs, basic, sign, L) {
  const B = [
    [sign / L, 1, -sign / L, 0],
    [sign / L, 0, -sign / L, 1],
  ];
  for (let a = 0; a < 4; a += 1) {
    for (let b = 0; b < 4; b += 1) {
      let value = 0;
      for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) value += B[i][a] * basic[i][j] * B[j][b];
      k[dofs[a]][dofs[b]] += value;
    }
  }
}

function integrateTaper(taper, L, fn) {
  if (!(L > 0) || !taper?.ok) return NaN;
  const points = GAUSS[taper.gaussPoints] || GAUSS[5];
  return points.reduce((sum, [coordinate, weight]) => {
    const s = (coordinate + 1) / 2;
    return sum + weight * fn(taperedSectionAt(taper, s), s, s * L);
  }, 0) * L / 2;
}

function normalizeSegments(input, getSection) {
  const rows = input.map((item, index) => {
    const start = Number(item.start ?? item.xi0 ?? (index / input.length));
    const end = Number(item.end ?? item.xi1 ?? ((index + 1) / input.length));
    const sectionId = item.sectionId || item.secId;
    const section = flattenSection(getSection(sectionId));
    return { start, end, sectionId, section: propertySnapshot(section) };
  }).sort((a, b) => a.start - b.start);
  const valid = rows.every((row) => row.sectionId && validSection(row.section) && row.start >= 0 && row.end <= 1 && row.end > row.start)
    && Math.abs(rows[0].start) <= 1e-12
    && Math.abs(rows.at(-1).end - 1) <= 1e-12
    && rows.every((row, index) => index === 0 || Math.abs(row.start - rows[index - 1].end) <= 1e-12);
  return valid ? { ok: true, rows } : failed('BAD_MEMBER_TAPER_SEGMENTS', 'Taper segments must be contiguous on [0,1] and reference valid sections.');
}

function parabolicDepthSection(start, end, s) {
  const h0 = positive(start.H ?? start.h ?? start.depth);
  const h1 = positive(end.H ?? end.h ?? end.depth);
  if (!h0 || !h1) return interpolateSection(start, end, s);
  const ratio = ((1 - s) * h0 + s * h1) / h0;
  const out = interpolateSection(start, end, s);
  out.A = start.A * ratio;
  out.Ay = start.Ay * ratio;
  out.Az = start.Az * ratio;
  out.Iy = start.Iy * ratio ** 3;
  out.Iz = start.Iz * ratio ** 3;
  out.J = start.J * ratio ** 3;
  return out;
}

function interpolateSection(start, end, s) {
  const out = {};
  for (const key of PROPERTY_KEYS) out[key] = (1 - s) * start[key] + s * end[key];
  out.H = (1 - s) * Number(start.H || 0) + s * Number(end.H || 0);
  return out;
}

function flattenSection(section = {}) {
  const merged = section?.properties && typeof section.properties === 'object' ? { ...section, ...section.properties } : { ...section };
  const shear = resolveSectionShearAreas(merged);
  return { ...merged, Ay: positive(merged.Ay ?? shear.Ay), Az: positive(merged.Az ?? shear.Az) };
}

function propertySnapshot(section) {
  return Object.fromEntries(['id', 'H', 'B', ...PROPERTY_KEYS].map((key) => [key, section[key] ?? null]));
}

function validSection(section) {
  return PROPERTY_KEYS.every((key) => positive(section[key]));
}

function invert2(matrix) {
  const determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  if (!(Math.abs(determinant) > 0)) return [[NaN, NaN], [NaN, NaN]];
  return [[matrix[1][1] / determinant, -matrix[0][1] / determinant], [-matrix[1][0] / determinant, matrix[0][0] / determinant]];
}

function addPair(k, i, j, stiffness) {
  k[i][i] += stiffness;
  k[j][j] += stiffness;
  k[i][j] -= stiffness;
  k[j][i] -= stiffness;
}

function zero12() {
  return Array.from({ length: 12 }, () => new Array(12).fill(0));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function failed(reason, message) {
  return { version: TAPERED_MEMBER_VERSION, ok: false, reason, message };
}
