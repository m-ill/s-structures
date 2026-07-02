import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  DWG_ADAPTER_VERSION,
  DWG_CONVERSION_FAILED,
  DWG_CONVERTER_MISSING,
  DXF_PLAN_RECOGNITION_VERSION,
  PLAN_ASSEMBLY_VERSION,
  assemblePlansToImportCandidate,
  buildDwgConversionPreflight,
  buildDwgConversionReadiness,
  buildPlanAssemblyReview,
  createDwgConversionFailureResult,
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
assert.equal(missing.plan.audit.readiness.status, 'external-converter-required');
assert.equal(missing.plan.audit.readiness.agentDecision, 'request-ascii-dxf-or-configure-converter');

const plan = createDwgConversionPlan({ inputPath: 'sample.dwg', converterPath: 'C:/Tools/ODAFileConverter.exe' });
assert.equal(plan.canRun, true);
assert.equal(plan.targetFormat, 'ACAD2018_ASCII_DXF');
assert.equal(plan.outputPath, 'sample.dxf');
assert.equal(plan.command.executable, 'C:/Tools/ODAFileConverter.exe');
assert.deepEqual(plan.command.args.slice(2, 4), ['ACAD2018_ASCII_DXF', 'DXF']);
assert.equal(plan.audit.requiresExternalConverter, true);
assert.equal(plan.audit.readiness.status, 'ready-to-convert');
assert.equal(plan.audit.readiness.agentDecision, 'run-converter-then-parse-dxf');
const directReadiness = buildDwgConversionReadiness({ inputPath: 'sample.dwg', outputPath: 'sample.dxf' });
assert.equal(directReadiness.canRun, false);
assert.ok(directReadiness.missing.includes('converter-path'));

const unknownPreflight = buildDwgConversionPreflight({ plan });
assert.equal(unknownPreflight.status, 'needs-host-check');
assert.equal(unknownPreflight.canExecute, false);
assert.ok(unknownPreflight.unknown.includes('converter-file'));
assert.equal(unknownPreflight.agentDecision, 'run-host-preflight-before-conversion');

const blockedPreflight = buildDwgConversionPreflight({
  plan,
  converterExists: false,
  inputExists: true,
  outputDirWritable: true,
});
assert.equal(blockedPreflight.status, 'blocked');
assert.ok(blockedPreflight.blocking.includes('converter-file'));
assert.equal(blockedPreflight.agentDecision, 'fix-dwg-conversion-inputs-before-running');

const executablePreflight = buildDwgConversionPreflight({
  plan,
  converterExists: true,
  inputExists: true,
  outputDirWritable: true,
});
assert.equal(executablePreflight.status, 'ready-for-execution');
assert.equal(executablePreflight.canExecute, true);
assert.equal(executablePreflight.agentDecision, 'execute-converter-and-parse-output-dxf');

const failed = createDwgConversionFailureResult({ plan }, { message: 'converter exited', stderr: 'bad file', exitCode: 2 });
assert.equal(failed.ok, false);
assert.equal(failed.code, DWG_CONVERSION_FAILED);
assert.equal(failed.plan.outputPath, 'sample.dxf');
assert.equal(failed.exitCode, 2);

const cli = spawnSync(process.execPath, [
  'tools/convert-dwg.mjs',
  '--input', 'sample.dwg',
  '--converter', 'C:/Tools/ODAFileConverter.exe',
  '--out', 'tmp/import',
  '--converterExists', 'true',
  '--inputExists', 'true',
  '--outputDirWritable', 'true',
], { encoding: 'utf8' });
assert.equal(cli.status, 0);
assert.match(cli.stdout, /sample\.dxf/);
assert.match(cli.stdout, /ready-for-execution/);
assert.match(cli.stdout, /"readyToExecute": true/);

const blockedCli = spawnSync(process.execPath, [
  'tools/convert-dwg.mjs',
  '--input', 'sample.dwg',
  '--converter', 'C:/Tools/ODAFileConverter.exe',
  '--out', 'tmp/import',
], { encoding: 'utf8' });
assert.equal(blockedCli.status, 0);
assert.match(blockedCli.stdout, /"readyToExecute": false/);
assert.match(blockedCli.stdout, /"status": "blocked"/);

const layerMap = {
  'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
  'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
};
const story1 = recognizePlanDxf(readFileSync('tests/fixtures/dxf/plan-story-1.dxf', 'utf8'), {
  storyId: '1F',
  elevation: 0,
  layerMap,
  expected: { columns: 2, beams: 1 },
});
const story2 = recognizePlanDxf(readFileSync('tests/fixtures/dxf/plan-story-2.dxf', 'utf8'), {
  storyId: '2F',
  elevation: 3,
  layerMap,
  expected: { columns: 2, beams: 1 },
});
assert.equal(story1.version, DXF_PLAN_RECOGNITION_VERSION);
assert.equal(story1.columns.length, 2);
assert.equal(story1.beams.length, 1);
assert.equal(story1.texts[0].text, '1F');
assert.equal(story1.audit.recognitionQuality.recall.columns, 1);
assert.equal(story1.audit.recognitionQuality.recall.beams, 1);
assert.equal(story1.audit.recognitionQuality.ok, true);
assert.deepEqual(story1.audit.recognizedLayers, ['S-BEAM', 'S-COL']);
assert.deepEqual(story1.audit.unusedLayers, ['S-TEXT']);
assert.equal(story1.audit.layerUsage.find((row) => row.layer === 'S-TEXT').recognized, false);
assert.equal(story1.audit.labelEvidence.primaryLabel, '1F');
assert.equal(story1.audit.labelEvidence.agentDecision, 'use-labels-for-human-review');
assert.equal(story2.columns[0].z, 3);

const closedColumnPlan = recognizePlanDxf([
  '0', 'SECTION',
  '2', 'HEADER',
  '9', '$INSUNITS',
  '70', '6',
  '0', 'ENDSEC',
  '0', 'SECTION',
  '2', 'ENTITIES',
  '0', 'LWPOLYLINE',
  '8', 'S-COL',
  '10', '-0.2',
  '20', '-0.2',
  '10', '0.2',
  '20', '-0.2',
  '10', '0.2',
  '20', '0.2',
  '10', '-0.2',
  '20', '0.2',
  '10', '-0.2',
  '20', '-0.2',
  '0', 'LINE',
  '8', 'S-BEAM',
  '10', '0',
  '20', '0',
  '30', '0',
  '11', '5',
  '21', '0',
  '31', '0',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n'), {
  storyId: 'poly-column',
  elevation: 0,
  layerMap,
  expected: { columns: 1, beams: 1 },
});
assert.equal(closedColumnPlan.columns.length, 1);
assert.equal(closedColumnPlan.columns[0].source, 'closed-polyline');
assert.equal(closedColumnPlan.columns[0].x, 0);
assert.equal(closedColumnPlan.columns[0].y, 0);
assert.equal(closedColumnPlan.audit.counts.closedPolylineColumns, 1);
assert.equal(closedColumnPlan.audit.recognitionQuality.recall.columns, 1);

const candidate = assemblePlansToImportCandidate([story2, story1], {
  tolerance: 1e-6,
  minLength: 1e-4,
  source: { type: 'dxf-plan-assembly', units: 'm', fileId: 'plan-2story' },
});
assert.equal(candidate.import.version, PLAN_ASSEMBLY_VERSION);
assert.equal(validateImportCandidate(candidate).ok, true);
assert.equal(candidate.audit.planAssembly.planCount, 2);
assert.equal(candidate.audit.planAssembly.columnStackCount, 2);
assert.equal(candidate.audit.planAssembly.recognitionQuality.minColumnRecall, 1);
assert.equal(candidate.audit.planAssembly.recognitionQuality.minBeamRecall, 1);
assert.equal(candidate.audit.planAssembly.recognitionQuality.ok, true);
assert.equal(candidate.audit.planAssembly.columnContinuity.ok, true);
assert.equal(candidate.audit.planAssembly.columnContinuity.incompleteStackCount, 0);
assert.deepEqual(candidate.audit.planAssembly.labelEvidence.rows.map((row) => row.primaryLabel), ['1F', '2F']);
assert.equal(candidate.audit.planAssembly.labelEvidence.agentDecision, 'story-labels-available-for-review');
assert.equal(candidate.audit.planAssembly.review.status, 'ready-for-human-confirmation');
assert.equal(candidate.audit.planAssembly.review.confirmable, true);
assert.equal(candidate.audit.planAssembly.review.agentDecision, 'candidate-ready-for-import-review-ui');
assert.equal(candidate.candidates.members.filter((member) => member.kind === 'column').length, 2);
assert.equal(candidate.candidates.members.filter((member) => member.kind === 'beam').length, 2);
assert.deepEqual(candidate.candidates.stories.map((story) => story.z), [0, 3]);

const reviewSummary = summarizeImportEntry({ id: 'plan-2story-import', status: 'pending', candidate });
assert.equal(reviewSummary.review.confirmable, true);
assert.equal(reviewSummary.review.requiresHumanReview, true);
assert.equal(reviewSummary.decision.pending, true);
assert.equal(reviewSummary.decision.confirmable, true);
assert.equal(reviewSummary.decision.accepted, false);
assert.equal(reviewSummary.decision.rejected, false);
assert.equal(reviewSummary.review.sourceType, 'dxf-plan-assembly');
assert.equal(reviewSummary.review.planAssembly.planCount, 2);
assert.equal(reviewSummary.review.planAssembly.columnStackCount, 2);
assert.equal(reviewSummary.review.planAssembly.recognitionQuality.ok, true);
assert.equal(reviewSummary.review.planAssembly.columnContinuity.ok, true);
assert.equal(reviewSummary.review.planAssembly.review.confirmable, true);
assert.equal(reviewSummary.review.planAssembly.review.agentDecision, 'candidate-ready-for-import-review-ui');

const rejectedReview = summarizeImportEntry({ id: 'plan-2story-import', status: 'rejected', candidate });
assert.equal(rejectedReview.review.confirmable, false);
assert.equal(rejectedReview.decision.rejected, true);
assert.equal(rejectedReview.decision.confirmable, false);
assert.ok(rejectedReview.decision.reasons.includes('already-rejected'));

const weakStory = recognizePlanDxf(readFileSync('tests/fixtures/dxf/plan-story-1.dxf', 'utf8'), {
  storyId: 'weak',
  elevation: 0,
  layerMap,
  expected: { columns: 4, beams: 2 },
});
const weakCandidate = assemblePlansToImportCandidate([weakStory, story2], {
  tolerance: 1e-6,
  minLength: 1e-4,
  source: { type: 'dxf-plan-assembly', units: 'm', fileId: 'weak-plan' },
});
const weakReview = summarizeImportEntry({ id: 'weak-plan-import', status: 'pending', candidate: weakCandidate });
assert.equal(weakCandidate.audit.planAssembly.recognitionQuality.ok, false);
assert.equal(weakCandidate.audit.planAssembly.review.status, 'review-required');
assert.equal(weakCandidate.audit.planAssembly.review.agentDecision, 'hold-import-for-plan-review');
assert.ok(weakReview.review.reasons.includes('plan-recognition-quality-review-required'));

const discontinuousStory2 = { ...story2, columns: story2.columns.slice(0, 1) };
const discontinuousCandidate = assemblePlansToImportCandidate([story1, discontinuousStory2], {
  tolerance: 1e-6,
  minLength: 1e-4,
  source: { type: 'dxf-plan-assembly', units: 'm', fileId: 'discontinuous-plan' },
});
const discontinuousReview = summarizeImportEntry({
  id: 'discontinuous-plan-import',
  status: 'pending',
  candidate: discontinuousCandidate,
});
assert.equal(discontinuousCandidate.audit.planAssembly.columnContinuity.ok, false);
assert.equal(discontinuousCandidate.audit.planAssembly.review.status, 'review-required');
assert.equal(discontinuousCandidate.audit.planAssembly.columnContinuity.incompleteStackCount, 1);
assert.ok(discontinuousReview.review.reasons.includes('column-stack-continuity-review-required'));
const emptyReview = buildPlanAssemblyReview({ ordered: [], segments: [] });
assert.equal(emptyReview.confirmable, false);
assert.ok(emptyReview.reasons.includes('single-plan-assembly-review-required'));

console.log(JSON.stringify({
  ok: true,
  version: PLAN_ASSEMBLY_VERSION,
  dwgAdapter: DWG_ADAPTER_VERSION,
  columns: candidate.candidates.members.filter((member) => member.kind === 'column').length,
  beams: candidate.candidates.members.filter((member) => member.kind === 'beam').length,
}, null, 2));
