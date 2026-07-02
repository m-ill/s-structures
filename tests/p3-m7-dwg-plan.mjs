import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DWG_ADAPTER_VERSION,
  DWG_CONVERTER_MISSING,
  DXF_PLAN_RECOGNITION_VERSION,
  PLAN_ASSEMBLY_VERSION,
  assemblePlansToImportCandidate,
  createDwgConversionPlan,
  createDwgMissingConverterResult,
  recognizePlanDxf,
  summarizeImportEntry,
  validateImportCandidate,
} from '../src/index.js';

const missing = createDwgMissingConverterResult({ inputPath: 'sample.dwg' });
assert.equal(missing.version, DWG_ADAPTER_VERSION);
assert.equal(missing.code, DWG_CONVERTER_MISSING);
assert.equal(missing.ok, false);
assert.match(missing.message, /DXF/);

const plan = createDwgConversionPlan({ inputPath: 'sample.dwg', converterPath: 'C:/Tools/ODAFileConverter.exe' });
assert.equal(plan.canRun, true);
assert.equal(plan.targetFormat, 'ACAD2018_ASCII_DXF');

const layerMap = {
  'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
  'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
};
const story1 = recognizePlanDxf(readFileSync('tests/fixtures/dxf/plan-story-1.dxf', 'utf8'), { storyId: '1F', elevation: 0, layerMap });
const story2 = recognizePlanDxf(readFileSync('tests/fixtures/dxf/plan-story-2.dxf', 'utf8'), { storyId: '2F', elevation: 3, layerMap });
assert.equal(story1.version, DXF_PLAN_RECOGNITION_VERSION);
assert.equal(story1.columns.length, 2);
assert.equal(story1.beams.length, 1);
assert.equal(story1.texts[0].text, '1F');
assert.equal(story2.columns[0].z, 3);

const candidate = assemblePlansToImportCandidate([story2, story1], {
  tolerance: 1e-6,
  minLength: 1e-4,
  source: { type: 'dxf-plan-assembly', units: 'm', fileId: 'plan-2story' },
});
assert.equal(candidate.import.version, PLAN_ASSEMBLY_VERSION);
assert.equal(validateImportCandidate(candidate).ok, true);
assert.equal(candidate.audit.planAssembly.planCount, 2);
assert.equal(candidate.audit.planAssembly.columnStackCount, 2);
assert.equal(candidate.candidates.members.filter((member) => member.kind === 'column').length, 2);
assert.equal(candidate.candidates.members.filter((member) => member.kind === 'beam').length, 2);
assert.deepEqual(candidate.candidates.stories.map((story) => story.z), [0, 3]);

const reviewSummary = summarizeImportEntry({ id: 'plan-2story-import', status: 'pending', candidate });
assert.equal(reviewSummary.review.confirmable, true);
assert.equal(reviewSummary.review.requiresHumanReview, true);
assert.equal(reviewSummary.review.sourceType, 'dxf-plan-assembly');
assert.equal(reviewSummary.review.planAssembly.planCount, 2);
assert.equal(reviewSummary.review.planAssembly.columnStackCount, 2);

console.log(JSON.stringify({
  ok: true,
  version: PLAN_ASSEMBLY_VERSION,
  dwgAdapter: DWG_ADAPTER_VERSION,
  columns: candidate.candidates.members.filter((member) => member.kind === 'column').length,
  beams: candidate.candidates.members.filter((member) => member.kind === 'beam').length,
}, null, 2));
