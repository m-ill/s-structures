import assert from 'node:assert/strict';
import {
  KDS_LOAD_COMBINATION_PRESETS,
  KDS_LOAD_RULE_PACK,
  LOAD_COMBINATION_CHANGE_SET_VERSION,
  applyKdsLoadCombinationChangeSet,
  createKdsLoadCombinations,
  createPracticeModel,
  previewKdsLoadCombinationChangeSet,
  selectLoadCombinationsForPurpose,
} from '../src/index.js';
import {
  KDS_41_12_00_2022_RULE_PACK,
  createLoadCombinationsFromRulePack,
} from '../src/core/kdsLoadCombinations.js';
import {
  LOAD_COMBINATION_APPROVAL_VERSION,
  applyLoadCombinationChangeSet,
  approveLoadCombinationChangeSet,
  previewLoadCombinationChangeSet,
  validateLoadRulePack,
} from '../src/loads/loadCombinationChangeSet.js';

assert.equal(KDS_LOAD_RULE_PACK.status, 'candidate');
assert.equal(KDS_LOAD_RULE_PACK.verificationStatus, 'candidate');
assert.equal(KDS_LOAD_RULE_PACK.publicationStatus, 'draft');
assert.ok(KDS_LOAD_COMBINATION_PRESETS.every((preset) => preset.status === 'candidate'));
assert.equal(KDS_41_12_00_2022_RULE_PACK.status, 'candidate');
assert.equal(KDS_41_12_00_2022_RULE_PACK.verificationStatus, 'source-attached');
assert.equal(KDS_41_12_00_2022_RULE_PACK.evidenceStatus, 'source-attached');
assert.equal(KDS_41_12_00_2022_RULE_PACK.sourceHash, null);
assert.equal(KDS_41_12_00_2022_RULE_PACK.rules.filter((rule) => rule.method === 'strength').length, 7);
assert.equal(KDS_41_12_00_2022_RULE_PACK.rules.filter((rule) => rule.method === 'allowable').length, 8);
assert.ok(KDS_41_12_00_2022_RULE_PACK.sourceUrls.some((url) => url.includes('standard.go.kr')));
assert.ok(KDS_41_12_00_2022_RULE_PACK.amendmentsReviewed.includes('MOLIT Notice 2024-846'));
assert.equal(validateLoadRulePack(KDS_41_12_00_2022_RULE_PACK).ok, true);

const exactCases = [
  { id: 'D', name: 'Dead', type: 'dead', family: 'D' },
  { id: 'F', name: 'Fluid', type: 'fluid', family: 'F' },
  { id: 'T', name: 'Temperature', type: 'temperature', family: 'T' },
  { id: 'L', name: 'Live', type: 'live', family: 'L' },
  { id: 'LR', name: 'Roof live', type: 'roof', family: 'Lr' },
  { id: 'S', name: 'Snow', type: 'snow', family: 'S' },
  { id: 'R', name: 'Rain', type: 'rain', family: 'R' },
  { id: 'WX', name: 'Wind X', type: 'wind', family: 'W', direction: 'x' },
  { id: 'EX', name: 'Seismic X', type: 'seismic', family: 'E', direction: 'x' },
];
const exactModel = {
  meta: { projectId: 'PROJECT-KDS-001' },
  designBasis: { status: 'configured', designMethod: 'strength' },
  loadCases: exactCases,
  loadCombinations: [],
};
const exactStrength = createLoadCombinationsFromRulePack(exactModel, KDS_41_12_00_2022_RULE_PACK, {
  method: 'strength',
  includeReverseLateral: false,
});
const exactAllowable = createLoadCombinationsFromRulePack(exactModel, KDS_41_12_00_2022_RULE_PACK, {
  method: 'allowable',
  includeReverseLateral: false,
});
assert.deepEqual(
  exactStrength.find((combo) => combo.sourcePreset === 'KDS22-ST-02' && combo.factors.LR)?.factors,
  { D: 1.2, F: 1.2, T: 1.2, L: 1.6, LR: 0.5 },
);
const strengthTwoGroups = exactStrength.filter((combo) => combo.sourcePreset === 'KDS22-ST-03');
assert.equal(strengthTwoGroups.length, 6, 'three roof alternatives must expand independently from L/W');
assert.ok(strengthTwoGroups.every((combo) => ['LR', 'S', 'R'].filter((id) => combo.factors[id]).length === 1));
assert.ok(strengthTwoGroups.every((combo) => ['L', 'WX'].filter((id) => combo.factors[id]).length === 1));
assert.ok(exactStrength.some((combo) => combo.sourcePreset === 'KDS22-ST-04' && combo.factors.WX === 1));
assert.ok(exactStrength.some((combo) => combo.sourcePreset === 'KDS22-ST-06' && combo.factors.WX === 1));
assert.ok(exactAllowable.some((combo) => combo.sourcePreset === 'KDS22-ASD-05' && combo.factors.WX === 0.65));
assert.ok(exactAllowable.some((combo) => combo.sourcePreset === 'KDS22-ASD-05' && combo.factors.EX === 0.7));
const allowableTwoGroups = exactAllowable.filter((combo) => combo.sourcePreset === 'KDS22-ASD-06');
assert.equal(allowableTwoGroups.length, 6, 'W/E alternatives must not collapse Lr/S/R alternatives');
assert.ok(allowableTwoGroups.some((combo) => combo.factors.WX === 0.4875 && combo.factors.LR === 0.75));
assert.ok(allowableTwoGroups.some((combo) => combo.factors.EX === 0.525 && combo.factors.R === 0.75));
assert.ok(exactAllowable.some((combo) => combo.sourcePreset === 'KDS22-ASD-07' && combo.factors.WX === 0.65));

const sparseStrength = createLoadCombinationsFromRulePack({
  loadCases: exactCases.filter((loadCase) => ['D', 'L', 'LR'].includes(loadCase.id)),
}, KDS_41_12_00_2022_RULE_PACK, {
  method: 'strength',
  includeReverseLateral: false,
});
assert.deepEqual(
  sparseStrength.find((combo) => combo.sourcePreset === 'KDS22-ST-02')?.factors,
  { D: 1.2, L: 1.6, LR: 0.5 },
);
assert.deepEqual(
  sparseStrength.find((combo) => combo.sourcePreset === 'KDS22-ST-03')?.factors,
  { D: 1.2, L: 1.0, LR: 1.6 },
);
assert.ok(sparseStrength.every((combo) => !['F', 'T', 'WX', 'EX'].some((id) => id in combo.factors)));
assert.ok(sparseStrength.every((combo) => !['KDS22-ST-04', 'KDS22-ST-05', 'KDS22-ST-06', 'KDS22-ST-07'].includes(combo.sourcePreset)));

const candidateModel = createPracticeModel();
candidateModel.loadCases.push(
  { id: 'WX', name: 'Wind X', type: 'wind', family: 'W', direction: 'x' },
  { id: 'WY', name: 'Wind Y', type: 'wind', family: 'W', direction: 'y' },
);
const legacyCandidates = createKdsLoadCombinations(candidateModel);
assert.ok(legacyCandidates.length > 0, 'legacy candidate API remains available');
assert.ok(legacyCandidates.every((combo) => combo.status === 'candidate'));

const candidateBefore = structuredClone(candidateModel);
const candidatePreview = previewKdsLoadCombinationChangeSet(candidateModel, { method: 'strength' });
assert.equal(candidatePreview.version, LOAD_COMBINATION_CHANGE_SET_VERSION);
assert.equal(candidatePreview.guard.previewAllowed, true);
assert.equal(candidatePreview.guard.applyAllowed, false);
assert.ok(candidatePreview.guard.applyBlockers.includes('rule-pack-not-verified'));
assert.deepEqual(candidateModel, candidateBefore);
assert.throws(
  () => applyKdsLoadCombinationChangeSet(candidateModel, { method: 'strength' }),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED',
);
assert.deepEqual(candidateModel, candidateBefore, 'candidate apply guard must not mutate');

const exactPreview = previewLoadCombinationChangeSet(exactModel, KDS_41_12_00_2022_RULE_PACK, {
  method: 'strength',
  includeReverseLateral: false,
});
assert.equal(exactPreview.guard.previewAllowed, true);
assert.equal(exactPreview.guard.applyAllowed, false);
assert.ok(exactPreview.guard.applyBlockers.includes('rule-pack-not-verified'));
assert.throws(
  () => applyLoadCombinationChangeSet(exactModel, exactPreview),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED'
    && error.changeSet.guard.approvalBlockers.includes('project-approval-required'),
);

const exactApproved = approveLoadCombinationChangeSet(exactModel, exactPreview, {
  reviewer: { id: 'PE-KR-001', name: 'Project Engineer' },
  reviewedAt: '2026-07-10T09:00:00.000Z',
  projectId: 'PROJECT-KDS-001',
  note: 'Reviewed KDS 41 12 00:2022 factors and project load-case mapping.',
});
assert.equal(exactApproved.projectApproval.version, LOAD_COMBINATION_APPROVAL_VERSION);
assert.equal(exactApproved.projectApproval.globalCertification, false);
assert.equal(exactApproved.projectApproval.ruleFactorSnapshotHash, exactPreview.snapshot.ruleFactorSnapshotHash);
assert.equal(Object.isFrozen(exactApproved.projectApproval), true);

const approvedApply = applyLoadCombinationChangeSet(exactModel, exactApproved);
assert.equal(approvedApply.guard.approvalBypass, 'project-approved');
assert.ok(exactModel.loadCombinations.every((combo) => combo.origin === 'manual-reviewed'));
assert.ok(exactModel.loadCombinations.every((combo) => combo.approvalStatus === 'project-approved'));
assert.ok(exactModel.loadCombinations.every((combo) => combo.userModified === true));
assert.ok(exactModel.loadCombinations.every((combo) => Object.isFrozen(combo.approvalProvenance)));
const approvedRepeat = applyLoadCombinationChangeSet(exactModel, exactApproved);
assert.equal(approvedRepeat.summary.created, 0);
assert.equal(approvedRepeat.summary.updated, 0);
assert.equal(approvedRepeat.summary.unchanged, exactPreview.generated.length);

const tamperedApproval = structuredClone(exactApproved);
tamperedApproval.projectApproval.note = 'Tampered after approval';
assert.throws(
  () => applyLoadCombinationChangeSet(structuredClone({ ...exactModel, loadCombinations: [] }), tamperedApproval),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED'
    && error.changeSet.guard.approvalBlockers.includes('project-approval-hash-invalid'),
);
const tamperedRules = structuredClone(exactApproved);
tamperedRules.generated[0].factors.D = 9.9;
assert.throws(
  () => applyLoadCombinationChangeSet(structuredClone({ ...exactModel, loadCombinations: [] }), tamperedRules),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED'
    && error.changeSet.guard.approvalBlockers.includes('project-approval-rule-snapshot-stale'),
);
const staleApprovalModel = structuredClone({ ...exactModel, loadCombinations: [] });
staleApprovalModel.loadCases.push({ id: 'WY', name: 'Wind Y', type: 'wind', family: 'W', direction: 'y' });
assert.throws(
  () => applyLoadCombinationChangeSet(staleApprovalModel, exactApproved),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED'
    && error.changeSet.guard.approvalBlockers.includes('project-approval-model-stale'),
);

const verifiedPack = {
  id: 'TEST-LOAD-RULES@1',
  authority: 'Independent test authority',
  code: 'TEST LOAD',
  edition: '1',
  amendmentsReviewed: [],
  publicationStatus: 'effective',
  effectiveDate: '2026-01-01',
  verifiedAt: '2026-01-02',
  sourceUrls: ['https://example.invalid/test-load-rules'],
  sourceHash: 'sha256:test-fixture-v1',
  status: 'verified',
  methods: ['strength'],
  purposes: ['strength', 'p-delta', 'foundation', 'uplift'],
  rules: [
    {
      id: 'TEST-ST-01', name: 'Test gravity', type: 'strength', method: 'strength',
      purposes: ['strength', 'p-delta'], terms: { D: 1, L: 1 }, required: ['D', 'L'],
    },
    {
      id: 'TEST-ST-02', name: 'Test wind uplift', type: 'strength', method: 'strength',
      purposes: ['foundation', 'uplift'], terms: { D: 0.9, W: 1 }, required: ['D', 'W'], directional: 'W',
    },
  ],
};
assert.equal(validateLoadRulePack(verifiedPack).ok, true);

const model = createPracticeModel({
  designBasis: { status: 'configured', designMethod: 'strength' },
  loadCombinations: [],
});
model.loadCases.push(
  { id: 'WX', name: 'Wind X', type: 'wind', family: 'W', direction: 'x' },
  { id: 'WY', name: 'Wind Y', type: 'wind', family: 'W', direction: 'y' },
);
const before = structuredClone(model);
const preview = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'strength' });
assert.deepEqual(model, before, 'rule-pack preview must be pure');
assert.equal(preview.status, 'ready');
assert.equal(preview.guard.applyAllowed, true);
assert.equal(preview.generated.length, 5);
assert.ok(preview.generated.some((combo) => combo.factors.WX === 1));
assert.ok(preview.generated.some((combo) => combo.factors.WX === -1));
assert.ok(preview.generated.every((combo) => combo.rulePack.sourceHash === verifiedPack.sourceHash));
assert.equal(new Set(preview.generated.map((combo) => combo.generatedKey)).size, preview.generated.length);

applyLoadCombinationChangeSet(model, preview);
const repeat = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'strength' });
assert.equal(repeat.summary.created, 0);
assert.equal(repeat.summary.updated, 0);
assert.equal(repeat.summary.unchanged, preview.generated.length);

const protectedCombo = model.loadCombinations.find((combo) => combo.sourcePreset === 'TEST-ST-01');
protectedCombo.factors.L = 0.75;
protectedCombo.userModified = true;
const conflictPreview = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'strength' });
assert.ok(conflictPreview.conflicts.some((item) => item.id === protectedCombo.id));
applyLoadCombinationChangeSet(model, conflictPreview);
assert.equal(model.loadCombinations.find((combo) => combo.id === protectedCombo.id).factors.L, 0.75);

const stalePreview = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'strength' });
const protectedAfterPreview = model.loadCombinations.find((combo) => combo.sourcePreset === 'TEST-ST-02');
protectedAfterPreview.name = 'Engineer-edited uplift combination';
protectedAfterPreview.userModified = true;
const staleApply = applyLoadCombinationChangeSet(model, stalePreview);
assert.ok(staleApply.conflicts.some((item) => item.id === protectedAfterPreview.id));
assert.equal(
  model.loadCombinations.find((combo) => combo.id === protectedAfterPreview.id).name,
  'Engineer-edited uplift combination',
);

const mismatch = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'allowable' });
assert.equal(mismatch.status, 'blocked');
assert.ok(mismatch.guard.generationBlockers.includes('rule-pack-method-mismatch'));

const methodStale = previewLoadCombinationChangeSet(model, verifiedPack, { method: 'strength' });
const combinationsBeforeMethodChange = structuredClone(model.loadCombinations);
model.designBasis.designMethod = 'allowable';
assert.throws(
  () => applyLoadCombinationChangeSet(model, methodStale),
  (error) => error.code === 'LOAD_COMBINATION_CHANGE_SET_BLOCKED',
);
assert.deepEqual(model.loadCombinations, combinationsBeforeMethodChange);
model.designBasis.designMethod = 'strength';

const foundation = selectLoadCombinationsForPurpose(model, 'foundation', { method: 'strength' });
assert.equal(foundation.combinations.length, 4);
assert.ok(foundation.combinations.every((combo) => combo.purposes.includes('foundation')));

console.log(JSON.stringify({
  ok: true,
  version: LOAD_COMBINATION_CHANGE_SET_VERSION,
  generated: preview.generated.length,
  candidateApplyBlocked: true,
  protectedConflicts: conflictPreview.conflicts.length,
}, null, 2));
