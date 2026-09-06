import { computeSectionProperties } from '../sectionProperties.js';

export const PRACTICAL_SECTION_DB_VERSION = 'p7-practical-section-seed-v1';

const SOURCE = Object.freeze({
  db: PRACTICAL_SECTION_DB_VERSION,
  scope: 'builtin',
  propertyMethod: 'computed-parametric',
  verificationStatus: 'geometry-seed',
  note: 'Frequently used modeling seed. Confirm the project section table before final design.',
});

export const ADDITIONAL_PRACTICAL_SECTIONS = Object.freeze([
  section('h100', 'H-100x100x6x8', 'H', { H: 100, B: 100, tw: 6, tf: 8 }),
  section('h150', 'H-150x150x7x10', 'H', { H: 150, B: 150, tw: 7, tf: 10 }),
  section('h250', 'H-250x125x6x9', 'H', { H: 250, B: 125, tw: 6, tf: 9 }),
  section('h300w', 'H-300x300x10x15', 'H', { H: 300, B: 300, tw: 10, tf: 15 }),
  section('h350', 'H-350x175x7x11', 'H', { H: 350, B: 175, tw: 7, tf: 11 }),
  section('h400w', 'H-400x400x13x21', 'H', { H: 400, B: 400, tw: 13, tf: 21 }),
  section('h500', 'H-500x200x10x16', 'H', { H: 500, B: 200, tw: 10, tf: 16 }),
  section('h600', 'H-600x200x11x17', 'H', { H: 600, B: 200, tw: 11, tf: 17 }),
  section('box100', 'BOX-100x100x4.5', 'BOX', { H: 100, B: 100, t: 4.5 }),
  section('box150', 'BOX-150x150x6', 'BOX', { H: 150, B: 150, t: 6 }),
  section('box250', 'BOX-250x250x9', 'BOX', { H: 250, B: 250, t: 9 }),
  section('box300', 'BOX-300x300x12', 'BOX', { H: 300, B: 300, t: 12 }),
  section('box400', 'BOX-400x400x16', 'BOX', { H: 400, B: 400, t: 16 }),
  section('pipe101', 'PIPE-101.6x4', 'PIPE', { D: 101.6, t: 4 }),
  section('pipe139', 'PIPE-139.8x4.5', 'PIPE', { D: 139.8, t: 4.5 }),
  section('pipe165', 'PIPE-165.2x5', 'PIPE', { D: 165.2, t: 5 }),
  section('pipe216', 'PIPE-216.3x6', 'PIPE', { D: 216.3, t: 6 }),
  section('pipe267', 'PIPE-267.4x9', 'PIPE', { D: 267.4, t: 9 }),
  section('rcsq300', 'RC SQUARE 300x300', 'SQUARE', { B: 300 }),
  section('rcsq400', 'RC SQUARE 400x400', 'SQUARE', { B: 400 }),
  section('rcsq500', 'RC SQUARE 500x500', 'SQUARE', { B: 500 }),
  section('rcsq600', 'RC SQUARE 600x600', 'SQUARE', { B: 600 }),
  section('rcsq700', 'RC SQUARE 700x700', 'SQUARE', { B: 700 }),
  section('rc3050', 'RC RECT 300x500', 'RECT', { B: 300, H: 500 }),
  section('rc4060', 'RC RECT 400x600', 'RECT', { B: 400, H: 600 }),
  section('rc4070', 'RC RECT 400x700', 'RECT', { B: 400, H: 700 }),
  section('rc5080', 'RC RECT 500x800', 'RECT', { B: 500, H: 800 }),
]);

function section(id, name, shape, params) {
  const properties = computeSectionProperties(shape, params);
  return Object.freeze({
    id,
    version: 1,
    name,
    kind: 'parametric',
    type: shape,
    shape,
    dims: Object.freeze({ ...params }),
    params: Object.freeze({ ...params }),
    properties: Object.freeze({ ...properties }),
    ...properties,
    source: SOURCE,
  });
}
