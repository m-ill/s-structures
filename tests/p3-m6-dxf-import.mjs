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
assert.equal(parsed.header.$ACADVER, 'AC1027');
assert.deepEqual(parsed.header.$EXTMIN, [0, 0, 0]);
assert.deepEqual(parsed.header.$EXTMAX, [5000, 0, 3000]);
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
assert.deepEqual(candidate.source.transform.origin, [0, 0, 0]);
assert.equal(candidate.audit.units.scale, 0.001);
assert.deepEqual(candidate.audit.normalization.origin, [0, 0, 0]);
assert.equal(candidate.audit.normalization.sourceBbox.sizeM.x, 5);
assert.equal(candidate.audit.bbox.sizeM.z, 3);
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
assert.equal(analysisModel.meta.importReview.required, true);
assert.equal(analysisModel.meta.importReview.status, 'review-required');
assert.equal(analysisModel.meta.importReview.agentDecision, 'review-import-candidate-before-final-use');
assert.equal(analysisModel.loads.every((load) => load.source === 'dxf-candidate-e2e'), true);
assert.ok(analysis.envelope.dmax >= 0);

const confirmedAnalysisModel = importCandidateToModel(candidate, { confirmed: true, topDeadLoad: 1 });
assert.equal(confirmedAnalysisModel.meta.importReview.required, false);
assert.equal(confirmedAnalysisModel.meta.importReview.status, 'confirmed');
assert.equal(confirmedAnalysisModel.meta.importReview.agentDecision, 'import-candidate-confirmed-for-analysis');

const offsetCandidate = importDxfToCandidate(shiftDxfCoordinates(text, { x: 100000, y: 200000, z: 0 }), {
  fileId: 'offset-min-frame.dxf',
  tolerance: 1e-6,
  minLength: 1e-4,
  normalizeOrigin: 'bbox-min',
  layerMap: {
    'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
    'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
  },
});
assert.equal(validateImportCandidate(offsetCandidate).ok, true);
assert.deepEqual(offsetCandidate.source.transform.origin, [100, 200, 0]);
assert.deepEqual(offsetCandidate.audit.normalization.origin, [100, 200, 0]);
assert.equal(offsetCandidate.audit.normalization.sourceBbox.min.x, 100);
assert.equal(offsetCandidate.audit.normalization.sourceBbox.min.y, 200);
assert.equal(offsetCandidate.audit.bbox.min.x, 0);
assert.equal(offsetCandidate.audit.bbox.min.y, 0);
assert.equal(offsetCandidate.audit.bbox.sizeM.x, 5);
assert.equal(offsetCandidate.audit.bbox.sizeM.z, 3);

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

const circleText = [
  '0', 'SECTION',
  '2', 'HEADER',
  '9', '$INSUNITS',
  '70', '6',
  '0', 'ENDSEC',
  '0', 'SECTION',
  '2', 'ENTITIES',
  '0', 'LINE',
  '8', 'S-BEAM',
  '10', '0',
  '20', '0',
  '30', '0',
  '11', '1',
  '21', '0',
  '31', '0',
  '0', 'CIRCLE',
  '8', 'S-COL',
  '10', '0.5',
  '20', '0.5',
  '30', '0',
  '40', '0.2',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');
const circleGeometry = dxfEntitiesToGeometry(parseDxf(circleText));
assert.equal(circleGeometry.audit.counts.CIRCLE, 1);
assert.equal(circleGeometry.circles.length, 1);
assert.equal(circleGeometry.circles[0].layer, 'S-COL');
assert.equal(circleGeometry.circles[0].radius, 0.2);
const circleCandidate = importDxfToCandidate(circleText, {
  fileId: 'circle-audit.dxf',
  layerMap: { 'S-BEAM': { kind: 'beam' }, 'S-COL': { kind: 'column' } },
});
assert.equal(circleCandidate.audit.counts.circles, 1);
assert.equal(circleCandidate.audit.counts.dxfCircles, 1);
assert.equal(circleCandidate.audit.counts.supportedEntityCount, 2);
assert.equal(circleCandidate.audit.layers.layerUsage.find((row) => row.layer === 'S-COL').byType.CIRCLE, 1);

const closedPolylineText = [
  '0', 'SECTION',
  '2', 'HEADER',
  '9', '$INSUNITS',
  '70', '6',
  '0', 'ENDSEC',
  '0', 'SECTION',
  '2', 'ENTITIES',
  '0', 'LWPOLYLINE',
  '8', 'S-WALL',
  '70', '1',
  '10', '0',
  '20', '0',
  '10', '3',
  '20', '0',
  '10', '3',
  '20', '2',
  '10', '0',
  '20', '2',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');
const closedPolylineGeometry = dxfEntitiesToGeometry(parseDxf(closedPolylineText));
assert.equal(closedPolylineGeometry.segments.length, 4);
assert.deepEqual(closedPolylineGeometry.segments.at(-1).from, { x: 0, y: 2, z: 0 });
assert.deepEqual(closedPolylineGeometry.segments.at(-1).to, { x: 0, y: 0, z: 0 });
const closedPolylineCandidate = importDxfToCandidate(closedPolylineText, {
  fileId: 'closed-polyline.dxf',
  layerMap: { 'S-WALL': { kind: 'beam' } },
});
assert.equal(validateImportCandidate(closedPolylineCandidate).ok, true);
assert.equal(closedPolylineCandidate.audit.counts.dxfSegments, 4);
assert.equal(closedPolylineCandidate.audit.layers.layerUsage.find((row) => row.layer === 'S-WALL').byType.LWPOLYLINE, 1);

console.log(JSON.stringify({
  ok: true,
  version: DXF_IMPORT_VERSION,
  nodes: candidate.candidates.nodes.length + blockCandidate.candidates.nodes.length,
  members: candidate.candidates.members.length + blockCandidate.candidates.members.length,
  layers: [...new Set([...candidate.audit.layers.layers, ...blockCandidate.audit.layers.layers])].sort(),
}, null, 2));

function shiftDxfCoordinates(dxfText, delta) {
  const lines = dxfText.split(/\r?\n/);
  const shifted = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(String(lines[i]).trim());
    const value = lines[i + 1];
    shifted.push(lines[i]);
    if ([10, 11].includes(code)) shifted.push(String(Number(value) + delta.x));
    else if ([20, 21].includes(code)) shifted.push(String(Number(value) + delta.y));
    else if ([30, 31].includes(code)) shifted.push(String(Number(value) + delta.z));
    else shifted.push(value);
  }
  return shifted.join('\n');
}
