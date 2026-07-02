import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeModel,
  DXF_ENTITIES_VERSION,
  DXF_IMPORT_VERSION,
  DXF_PARSER_VERSION,
  dxfEntitiesToGeometry,
  importCandidateToModel,
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
assert.equal(candidate.audit.counts.lines, 3);
assert.equal(candidate.audit.counts.polylines, 0);
assert.equal(candidate.audit.counts.inserts, 0);
assert.equal(candidate.audit.counts.texts, 0);
assert.equal(candidate.audit.counts.points, 0);
assert.equal(candidate.audit.counts.circles, 0);
assert.equal(candidate.audit.counts.dxfSegments, 3);
assert.equal(candidate.audit.counts.supportedEntityCount, 3);
assert.equal(candidate.audit.counts.unsupportedEntityCount, 0);
assert.equal(candidate.audit.layers.mappedLayers.length, 2);
assert.equal(candidate.audit.layers.unmappedEntityCount, 0);
assert.equal(candidate.audit.layers.unmappedSegmentCount, 0);
assert.equal(candidate.audit.layers.layerUsage.find((row) => row.layer === 'S-COL').byType.LINE, 2);
assert.deepEqual(candidate.audit.mapping, candidate.audit.layers);
assert.equal(candidate.audit.merge.nodesBefore, 6);
assert.equal(candidate.audit.merge.nodesAfter, 4);
assert.equal(candidate.audit.merge.shortSegmentsDropped, 0);
assert.equal(candidate.audit.merge.duplicatesDropped, 0);
assert.deepEqual(candidate.audit.orphans.nodes, []);
assert.deepEqual(candidate.audit.orphans.unknownKindMembers, []);
assert.equal(candidate.candidates.nodes.length, 4);
assert.equal(candidate.candidates.members.length, 3);
assert.deepEqual(candidate.candidates.members.map((member) => member.kind).sort(), ['beam', 'column', 'column']);
assert.ok(candidate.candidates.nodes.some((node) => node.z === 3));

const analysisModel = importCandidateToModel(candidate, { topDeadLoad: 1 });
const analysis = analyzeModel(analysisModel);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysisModel.meta.importSource, 'dxf');
assert.equal(analysisModel.meta.importFileId, 'min-frame.dxf');
assert.equal(analysisModel.loads.every((load) => load.source === 'dxf-candidate-e2e'), true);
assert.ok(analysis.envelope.dmax >= 0);

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
assert.deepEqual(blockGeometry.audit.ignoredDetails, [
  { type: 'ARC', layer: 'S-REF', reason: 'unsupported-entity' },
]);
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
assert.equal(blockCandidate.audit.counts.lines, 0);
assert.equal(blockCandidate.audit.counts.polylines, 2);
assert.equal(blockCandidate.audit.counts.inserts, 2);
assert.equal(blockCandidate.audit.counts.texts, 1);
assert.equal(blockCandidate.audit.counts.points, 1);
assert.equal(blockCandidate.audit.counts.circles, 0);
assert.equal(blockCandidate.audit.counts.ignored.ARC, 1);
assert.equal(blockCandidate.audit.counts.ignoredDetails[0].layer, 'S-REF');
assert.equal(blockCandidate.audit.counts.supportedEntityCount, 6);
assert.equal(blockCandidate.audit.counts.unsupportedEntityCount, 1);
assert.equal(blockCandidate.audit.layers.unmappedEntityCount, 3);
assert.equal(blockCandidate.audit.layers.unmappedSegmentCount, 0);
assert.deepEqual(blockCandidate.audit.layers.ignoredLayers, ['S-REF']);
assert.deepEqual(blockCandidate.audit.layers.layers, ['S-BEAM', 'S-BRACE', 'S-COL', 'S-GRID', 'S-REF', 'S-TEXT']);
assert.equal(blockCandidate.audit.layers.layerUsage.find((row) => row.layer === 'S-REF').mapped, false);
assert.equal(blockCandidate.audit.layers.layerUsage.find((row) => row.layer === 'S-REF').byType.ARC, 1);
assert.equal(blockCandidate.audit.merge.nodesBefore, 8);
assert.equal(blockCandidate.audit.merge.nodesAfter, 4);
assert.deepEqual(blockCandidate.audit.orphans.nodes, []);
assert.deepEqual(blockCandidate.audit.orphans.unknownKindMembers, []);
assert.equal(blockCandidate.candidates.members.length, 4);
assert.deepEqual(blockCandidate.candidates.members.map((member) => member.kind).sort(), ['beam', 'brace', 'column', 'column']);

console.log(JSON.stringify({
  ok: true,
  version: DXF_IMPORT_VERSION,
  nodes: candidate.candidates.nodes.length + blockCandidate.candidates.nodes.length,
  members: candidate.candidates.members.length + blockCandidate.candidates.members.length,
  layers: [...new Set([...candidate.audit.layers.layers, ...blockCandidate.audit.layers.layers])].sort(),
}, null, 2));
