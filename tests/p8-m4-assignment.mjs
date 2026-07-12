import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { undoModelTransaction } from '../src/modeling/transaction.js';
import { buildHingedFrame3dEntries } from '../src/nonlinear/elements/hingedFrame3d.js';
import {
  applyHingeAssignmentChangeSet,
  previewHingeAssignmentChangeSet,
  resolveDomainHingeAssignments,
} from '../src/nonlinear/properties/assignments.js';
import { createHingePropertyRegistry, validateHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';

const model = steelModel();
const originalHash = stableHash(model);
const options = assignmentOptions();
const preview = previewHingeAssignmentChangeSet(model, options);
assert.equal(preview.status, 'ready', JSON.stringify(preview.errors));
assert.equal(preview.properties.length, 2);
assert.equal(preview.assignments.length, 4);
assert.equal(stableHash(model), originalHash, 'preview must not mutate the model');
preview.properties.forEach((property) => {
  assert.equal(validateHingeProperty(property).ok, true);
  assert.equal(property.qualification, 'candidate');
  assert.equal(property.source.materialSnapshot.id, 'MAT');
  assert.equal(property.source.sectionSnapshot.id, 'SEC');
  assert.equal(property.source.steelGrade, 'SS275');
  assert.deepEqual(property.source.sectionThickness, { tw: 0.009, tf: 0.014 });
});
const propertyY = preview.properties.find((row) => row.id === 'HP:M1:y');
const propertyZ = preview.properties.find((row) => row.id === 'HP:M1:z');
const yieldY = propertyY.parameters.backbone.positive[1].moment;
const yieldZ = propertyZ.parameters.backbone.positive[1].moment;
close(yieldZ / yieldY, 2, 1e-12, 'axis-specific plastic modulus ratio');

const applied = applyHingeAssignmentChangeSet(model, preview, options);
assert.equal(applied.applied, true);
assert.equal(stableHash(model), originalHash, 'apply returns a transaction model and preserves the input object');
assert.equal(applied.model.hingeProperties.length, 2);
assert.equal(applied.model.members[0].nonlinear.hinges.length, 4);
assert.equal(applied.transaction.summary['hingeProperties.add'], 2);
assert.equal(applied.transaction.summary['members.update'], 1);

const domain = buildCanonicalAnalysisDomain(applied.model);
assert.equal(domain.ok, true, domain.reason);
const resolved = resolveDomainHingeAssignments(domain);
assert.equal(resolved.rows.length, 4);
const resolvedJy = resolved.rows.find((row) => row.id === 'M1:j:y');
assert.equal(resolvedJy.axialRatioTrace.applied, 0.3);
assert.equal(resolvedJy.source.propertyHash, resolvedJy.property.contentHash);
close(
  resolvedJy.property.parameters.backbone.positive[1].moment / yieldY,
  0.85,
  1e-12,
  'PMM interpolation factor',
);
assert.equal(resolvedJy.source.mode, 'user-override');
assert.ok(resolvedJy.source.overrideFields.includes('axialRatio'));
const resolvedEntries = buildHingedFrame3dEntries(domain, { assignmentResolution: resolved });
assert.equal(resolvedEntries.length, 1);
assert.doesNotThrow(() => resolvedEntries[0].kernel.evaluate({ trialKinematics: { uGlobal: new Array(12).fill(0) } }));

const undo = undoModelTransaction(applied.model, applied.transaction);
assert.equal(undo.ok, true, JSON.stringify(undo.errors));
assert.equal(stableHash(undo.model), originalHash, 'undo must restore the pre-assignment model byte semantics');

const outOfRange = structuredClone(applied.model);
outOfRange.members[0].nonlinear.hinges.find((row) => row.id === 'M1:j:y').axialRatio = 0.9;
assert.throws(
  () => resolveDomainHingeAssignments(buildCanonicalAnalysisDomain(outOfRange)),
  (error) => error?.code === 'HINGE_PMM_AXIAL_RATIO_OUT_OF_RANGE',
);

const tampered = structuredClone(propertyY);
tampered.parameters.hingeLength *= 2;
assert.equal(validateHingeProperty(tampered).errors.includes('HINGE_PROPERTY_CONTENT_HASH_MISMATCH'), true);
assert.throws(
  () => createHingePropertyRegistry([propertyY, tampered]),
  (error) => error?.code === 'HINGE_PROPERTY_REGISTRY_INVALID',
);

const rcMissing = previewHingeAssignmentChangeSet(rcModel(), assignmentOptions());
assert.equal(rcMissing.status, 'blocked');
assert.ok(rcMissing.errors.some((issue) => issue.code === 'HINGE_RC_REINFORCEMENT_SNAPSHOT_REQUIRED'));
const rcOptions = assignmentOptions({
  reinforcementSnapshots: {
    M1: {
      id: 'RC-REBAR-M1-R1',
      source: { reference: 'approved-detailing-snapshot' },
      capacities: { y: 180, z: 320 },
      bars: [{ id: 'D22', count: 8, area: 0.000387 }],
      cover: 0.04,
      ties: { id: 'D10', spacing: 0.15 },
    },
  },
});
const rcPreview = previewHingeAssignmentChangeSet(rcModel(), rcOptions);
assert.equal(rcPreview.status, 'ready', JSON.stringify(rcPreview.errors));
assert.equal(rcPreview.properties.every((row) => row.source.reinforcementSnapshot.id === 'RC-REBAR-M1-R1'), true);
close(
  rcPreview.properties.find((row) => row.id.endsWith(':z')).parameters.backbone.positive[1].moment,
  320,
  1e-12,
  'RC z-axis snapshot capacity',
);

const missingRule = previewHingeAssignmentChangeSet(steelModel(), { units: { moment: 'kN-m', length: 'm' } });
assert.equal(missingRule.status, 'blocked');
assert.ok(missingRule.errors.some((issue) => issue.code === 'HINGE_AUTO_RULE_REQUIRED'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-HNG-12'],
  propertyCount: preview.properties.length,
  assignmentCount: preview.assignments.length,
  yYieldMoment: yieldY,
  zYieldMoment: yieldZ,
  pmmMomentFactor: resolvedJy.axialRatioTrace.interpolation.momentFactor,
  undoRestored: stableHash(undo.model) === originalHash,
  rcMissingSnapshotBlocked: true,
}, null, 2));

function assignmentOptions(extra = {}) {
  const rule = {
    initialStiffnessRatio: 20,
    hingeLengthFactor: 0.5,
    thetaC: 4,
    thetaD: 8,
    thetaE: 12,
    momentC: 1.1,
    momentD: 0.2,
    momentE: 0.2,
    source: { reference: 'PROJECT-HINGE-RULE-01', edition: '2026', clause: 'project-calibration' },
    pmm: {
      sourceId: 'PROJECT-PMM-01',
      levels: [
        { axialRatio: 0, momentFactor: 1, rotationFactor: 1 },
        { axialRatio: 0.6, momentFactor: 0.7, rotationFactor: 0.8 },
      ],
    },
  };
  return {
    rules: { default: rule },
    units: { moment: 'kN-m', length: 'm' },
    generatedAt: '2026-07-12T00:00:00+09:00',
    assignmentOverrides: { 'M1:j:y': { axialRatio: 0.3 } },
    ...extra,
  };
}

function steelModel() {
  return baseModel(
    { id: 'MAT', version: 1, kind: 'steel', name: 'SS275', E: 205000, G: 79000, Fy: 275 },
    {
      id: 'SEC', version: 1, kind: 'steel', shape: 'H', type: 'H',
      A: 0.012, Iy: 0.0004, Iz: 0.0008, Zy: 0.004, Zz: 0.008, J: 0.00002,
      H: 0.5, B: 0.25, params: { H: 0.5, B: 0.25, tw: 0.009, tf: 0.014 },
    },
  );
}

function rcModel() {
  return baseModel(
    { id: 'MAT', version: 1, kind: 'concrete', name: 'C30', E: 30000, G: 12500, fck: 30, fy_rebar: 400 },
    {
      id: 'SEC', version: 1, kind: 'concrete', shape: 'RECT', type: 'RECT',
      A: 0.18, Iy: 0.00135, Iz: 0.0054, Zy: 0.009, Zz: 0.018, J: 0.0037,
      H: 0.6, B: 0.3, params: { H: 0.6, B: 0.3 },
    },
  );
}

function baseModel(material, section) {
  return {
    schemaVersion: 5,
    nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
    members: [{ id: 'M1', type: 'frame', behavior: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC' }],
    materials: [material],
    sections: [section],
    hingeProperties: [],
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    loads: [],
    loadCases: [],
    loadCombinations: [],
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
}
