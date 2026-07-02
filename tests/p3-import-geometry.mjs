import assert from 'node:assert/strict';
import {
  IMPORT_CANDIDATE_VERSION,
  IMPORT_GEOMETRY_VERSION,
  POINT_CLOUD_IMPORT_PIPELINE_VERSION,
  buildAgentManifest,
  cleanSegments,
  describePointCloudPipeline,
  validateImportCandidate,
  wireframeToImportCandidate,
} from '../src/index.js';

const segments = [
  { from: [0, 0, 0], to: [0, 0, 3], layer: 'COL' },
  { from: [0.0002, 0, 0], to: [0, 0, 3], layer: 'COL' },
  { from: [0, 0, 3], to: [5, 0, 3], layer: 'BEAM' },
  { from: [5, 0, 3], to: [5, 0, 6], layer: 'COL' },
  { from: [0, 0, 6], to: [5, 0, 3], layer: 'BRACE' },
  { from: [1, 1, 1], to: [1, 1, 1.0001], layer: 'SHORT' },
  { from: ['bad', 0, 0], to: [2, 2, 2], layer: 'INVALID' },
];

const cleaned = cleanSegments(segments, { tolerance: 1e-3, minLength: 1e-2 });
assert.equal(IMPORT_GEOMETRY_VERSION, 'p3-import-geometry-core');
assert.equal(cleaned.audit.shortSegments, 1);
assert.equal(cleaned.audit.duplicateSegments, 1);
assert.equal(cleaned.audit.invalidSegments, 1);
assert.equal(cleaned.members.length, 4);

const candidate = wireframeToImportCandidate(segments, {
  tolerance: 1e-3,
  minLength: 1e-2,
  source: { type: 'dxf', fileId: 'fixture-frame.dxf', units: 'm' },
});

assert.equal(candidate.version, IMPORT_CANDIDATE_VERSION);
assert.equal(candidate.source.type, 'dxf');
assert.equal(validateImportCandidate(candidate).ok, true);
assert.equal(candidate.audit.counts.members, 4);
assert.ok(candidate.audit.bbox);
assert.deepEqual(
  candidate.candidates.members.map((member) => member.kind).sort(),
  ['beam', 'brace', 'column', 'column'],
);
assert.deepEqual(candidate.candidates.stories.map((story) => story.z), [0, 3, 6]);
assert.ok(candidate.candidates.grids.some((grid) => grid.axis === 'X' && grid.position === 5));

const bad = structuredClone(candidate);
bad.candidates.members[0].from = 'missing';
assert.equal(validateImportCandidate(bad).ok, false);

const duplicateNode = structuredClone(candidate);
duplicateNode.candidates.nodes[1].id = duplicateNode.candidates.nodes[0].id;
assert.ok(validateImportCandidate(duplicateNode).errors.includes(`node.${duplicateNode.candidates.nodes[0].id}.duplicate`));

const missingMemberId = structuredClone(candidate);
delete missingMemberId.candidates.members[0].id;
assert.ok(validateImportCandidate(missingMemberId).errors.includes('member.id'));

const duplicateMember = structuredClone(candidate);
duplicateMember.candidates.members[1].id = duplicateMember.candidates.members[0].id;
assert.ok(validateImportCandidate(duplicateMember).errors.includes(`member.${duplicateMember.candidates.members[0].id}.duplicate`));

const selfMember = structuredClone(candidate);
selfMember.candidates.members[0].to = selfMember.candidates.members[0].from;
assert.ok(validateImportCandidate(selfMember).errors.includes(`member.${selfMember.candidates.members[0].id}.self`));

const pipeline = describePointCloudPipeline();
assert.equal(pipeline.version, POINT_CLOUD_IMPORT_PIPELINE_VERSION);
assert.equal(pipeline.status, 'available-core');
assert.ok(pipeline.stages.includes('import-candidate-review'));

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3ImportCandidate, IMPORT_CANDIDATE_VERSION);
assert.ok(manifest.milestones.some((row) => row.id === 'P3-M5' && row.status === 'available'));

console.log(JSON.stringify({ ok: true, version: 'p3-import-geometry' }, null, 2));
