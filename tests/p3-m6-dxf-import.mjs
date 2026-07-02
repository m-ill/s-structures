import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DXF_ENTITIES_VERSION,
  DXF_IMPORT_VERSION,
  DXF_PARSER_VERSION,
  dxfEntitiesToGeometry,
  importDxfToCandidate,
  parseDxf,
  validateImportCandidate,
} from '../src/index.js';

const text = readFileSync('tests/fixtures/dxf/min-frame.dxf', 'utf8');
const parsed = parseDxf(text);
assert.equal(parsed.version, DXF_PARSER_VERSION);
assert.equal(parsed.header.$INSUNITS, 4);
assert.ok(parsed.layers.some((layer) => layer.name === 'S-COL'));

const geometry = dxfEntitiesToGeometry(parsed);
assert.equal(geometry.version, DXF_ENTITIES_VERSION);
assert.equal(geometry.segments.length, 3);
assert.equal(geometry.audit.counts.LINE, 3);

const candidate = importDxfToCandidate(text, {
  fileId: 'min-frame.dxf',
  tolerance: 1e-6,
  minLength: 1e-4,
  layerMap: {
    'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
    'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
  },
});
assert.equal(candidate.import.version, DXF_IMPORT_VERSION);
assert.equal(validateImportCandidate(candidate).ok, true);
assert.equal(candidate.source.units, 'mm');
assert.equal(candidate.audit.units.scale, 0.001);
assert.equal(candidate.audit.counts.dxfSegments, 3);
assert.equal(candidate.audit.layers.mappedLayers.length, 2);
assert.equal(candidate.audit.layers.unmappedEntityCount, 0);
assert.equal(candidate.candidates.nodes.length, 4);
assert.equal(candidate.candidates.members.length, 3);
assert.deepEqual(candidate.candidates.members.map((member) => member.kind).sort(), ['beam', 'column', 'column']);
assert.ok(candidate.candidates.nodes.some((node) => node.z === 3));

const blockText = readFileSync('tests/fixtures/dxf/block-polyline.dxf', 'utf8');
const blockParsed = parseDxf(blockText);
const blockGeometry = dxfEntitiesToGeometry(blockParsed);
assert.equal(blockGeometry.segments.length, 4);
assert.equal(blockGeometry.points.length, 1);
assert.equal(blockGeometry.texts[0].text, 'G1');
assert.equal(blockGeometry.audit.counts.INSERT, 2);
assert.equal(blockGeometry.audit.counts.LWPOLYLINE, 1);
assert.equal(blockGeometry.audit.counts.POLYLINE, 1);
assert.equal(blockGeometry.audit.ignored.ARC, 1);
assert.deepEqual(blockGeometry.audit.blocks, ['COLBLK']);

const blockCandidate = importDxfToCandidate(blockText, {
  fileId: 'block-polyline.dxf',
  tolerance: 1e-6,
  minLength: 1e-4,
  layerMap: {
    'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
    'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
    'S-BRACE': { kind: 'brace', section: 'BR100', material: 'SS275' },
  },
});
assert.equal(validateImportCandidate(blockCandidate).ok, true);
assert.equal(blockCandidate.source.units, 'm');
assert.equal(blockCandidate.audit.counts.ignored.ARC, 1);
assert.equal(blockCandidate.candidates.members.length, 4);
assert.deepEqual(blockCandidate.candidates.members.map((member) => member.kind).sort(), ['beam', 'brace', 'column', 'column']);

console.log(JSON.stringify({
  ok: true,
  version: DXF_IMPORT_VERSION,
  nodes: candidate.candidates.nodes.length + blockCandidate.candidates.nodes.length,
  members: candidate.candidates.members.length + blockCandidate.candidates.members.length,
  layers: [...new Set([...candidate.audit.layers.layers, ...blockCandidate.audit.layers.layers])].sort(),
}, null, 2));
