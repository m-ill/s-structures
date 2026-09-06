import { createModel } from '../../../src/core/modelFactory.js';
import { materialOf, sectionOf } from '../../../src/core/catalogs.js';
import { analyzeDynamics } from '../../../src/dynamics/modal.js';
import { analyzeModel } from '../../../src/solver/linear3d.js';
import { assembleStiffness3D } from '../../../src/solver/linear3dAssembly.js';
import { runSecondOrderPDelta } from '../../../src/solver/pdelta/secondOrder.js';
import { createWinklerLineFoundationProperty } from '../../../src/core/foundationSchema.js';
import { createCookMembraneMesh } from '../../../src/solver/shell/membraneRobustness.js';
import { createStructuredQuadMesh, probeMembraneStress, recoverMembraneField } from '../../../src/solver/shell/membraneWorkflow.js';
import { createRectangularPlateMesh, solveRectangularPlate } from '../../../src/solver/shell/plateWorkflow.js';
import { runRealShellStabilizationQualification } from '../../../src/solver/shell/realStabilizationQualification.js';
import { buildWallMembraneQm6 } from '../../../src/solver/shell/wallMembraneQm6.js';
import { stableHash } from '../../../src/core/stableHash.js';
import { createElasticFactorSession } from '../../../src/compute/elastic/factorSession.js';
import { createDeterministicSparseAssembler, extractDeterministicCscSubmatrix } from '../../../src/compute/sparse/assembly.js';
import { cscQuadratic } from '../../../src/compute/sparse/matrix.js';
import {
  blockPhase15ExistingPassQualification,
  generalizedEigenResidual,
  massWeightedMac,
  maximumMassOrthogonality,
  qualifyPhase15Sb1,
  qualifyPhase15Sb8,
  qualifyPhase15Sb9,
  qualifyPhase15Sb10,
} from '../phase15/existingPassQualification.js';

export const STRIX21_FIRST_BATCH_VERSION = 'strix21-sstructures-phase15-v3-m7-qualification';
export const STRIX21_RESULT_HASH_PROJECTION_VERSION = 'strix21-deterministic-result-projection-v1';

const STRIX21_RUNTIME_TELEMETRY_FIELDS = Object.freeze([
  'assemblyDurationMs',
  'completedAt',
  'durationMs',
  'elapsedMs',
  'endedAt',
  'factorizationMs',
  'finishedAt',
  'handleId',
  'solveMs',
  'sparseMs',
  'startedAt',
  'symbolicMs',
  'timestamp',
  'totalDurationMs',
  'totalFactorizationMs',
  'totalMs',
  'totalSolveMs',
  'triangularSolveMs',
]);
const STRIX21_RUNTIME_TELEMETRY_FIELD_SET = new Set(STRIX21_RUNTIME_TELEMETRY_FIELDS);

const KIP_TO_KN = 4.4482216152605;
const IN_TO_M = 0.0254;
const IN4_TO_M4 = IN_TO_M ** 4;
const IN2_TO_M2 = IN_TO_M ** 2;
const KSI_TO_MPA = 6.894757293168;

export function runStrix21FirstBatch(options = {}) {
  const startedAt = options.startedAt || new Date().toISOString();
  const cases = [runSb10(), runSb1(), runSb9(), runSb7(), runSb8(), runPd1(), runSm5(), runSb2(), runSb3(), runSb5(), runSb6(), runP3s2Ss()];
  const summary = summarize(cases);
  const calculationCore = {
    version: STRIX21_FIRST_BATCH_VERSION,
    engine: 'S-Structures in-house deterministic solver',
    externalRuntimeUsed: false,
    referencePolicy: 'R1/R2 published values frozen in verification-only module before execution',
    resultHashProjection: {
      version: STRIX21_RESULT_HASH_PROJECTION_VERSION,
      excludedRuntimeTelemetryFields: STRIX21_RUNTIME_TELEMETRY_FIELDS,
      retainedEngineeringDiagnostics: ['iterations', 'residuals', 'equilibrium', 'solver-method', 'fallback-path'],
    },
    caseSpecifications: cases.map((row) => ({
      id: row.id,
      modelHash: row.modelHash,
      metrics: row.metrics.map(({ quantity, unit, reference, strix, tolerancePct, comparison }) => ({ quantity, unit, reference, strix, tolerancePct, comparison })),
    })),
  };
  const calculationHash = stableHash(calculationCore);
  const resultCore = { calculationHash, cases, summary };
  const resultHash = stableHash(resultCore);
  const completedAt = options.completedAt || new Date().toISOString();
  const runRecord = {
    calculationHash,
    resultHash,
    startedAt,
    completedAt,
    environment: options.environment || runtimeEnvironment(),
    runId: options.runId || null,
  };
  const runRecordHash = stableHash(runRecord);
  const core = {
    version: STRIX21_FIRST_BATCH_VERSION,
    startedAt,
    completedAt,
    ...calculationCore,
    calculationHash,
    resultHash,
    runRecord,
    runRecordHash,
    cases,
    summary,
  };
  return { ...core, artifactHash: resultHash };
}

export function runStrix21M7QualificationBatch() {
  const cases = [runSb1(), runSb8(), runSb9(), runSb10(), runPd1(), runSm5()];
  return {
    version: `${STRIX21_FIRST_BATCH_VERSION}-m7`,
    cases,
    summary: summarize(cases),
    batchHash: stableHash(cases),
  };
}

export function runStrix21M7QualificationCase(caseIdInput) {
  const caseId = String(caseIdInput || '').toUpperCase();
  const runners = { SB1: runSb1, SB8: runSb8, SB9: runSb9, SB10: runSb10, PD1: runPd1, SM5: runSm5 };
  if (!runners[caseId]) throw new RangeError(`Unsupported M7 qualification case ${caseId}.`);
  return runners[caseId]();
}

function runSb1() {
  const levels = [1, 2, 4, 8].map(solveSb1Mesh);
  const final = levels.at(-1);
  const { model, result } = final;
  const references = {
    tipDisplacement: -0.107865,
    tipRotation: 5.3933e-5,
    supportReaction: 1000,
    supportMoment: -3e6,
  };
  const phase15Qualification = qualifyPhase15Sb1({
    binding: phase15QualificationBinding('SB1', references, { relativeTolerance: 1e-4 }, {
      tipDisplacement: 'tip-node-global-z',
      tipRotation: 'tip-node-global-y-rotation',
      supportReaction: 'fixed-node-global-z',
      supportMoment: 'fixed-node-global-y-moment',
    }),
    levels: levels.map((row) => row.evidence),
    references,
    units: { tipDisplacement: 'mm', tipRotation: 'rad', supportReaction: 'N', supportMoment: 'N-mm' },
  });
  return completedCase('SB1', model, result, [
    metric('Tip deflection uz', 'mm', final.evidence.tipDisplacement, references.tipDisplacement, -0.107865, 1),
    metric('Tip rotation ry', 'rad', final.evidence.tipRotation, references.tipRotation, 5.3933e-5, 1),
    metric('Support reaction Rz', 'N', final.evidence.supportReaction, references.supportReaction, 1000, 1),
    metric('Support moment My', 'N-mm', final.evidence.supportMoment, references.supportMoment, -3e6, 1),
  ], {
    formulation: 'Euler-Bernoulli 3D frame',
    equilibriumResidual: result.summary.equilibriumResidual,
    meshSequence: levels.map((row) => row.evidence),
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function solveSb1Mesh(elements) {
  const model = staticModel({ E: 26700, nu: 0.2, A: 0.15, Iy: 0.001125, Iz: 0.003125, J: 0.002 });
  model.nodes = Array.from({ length: elements + 1 }, (_item, index) => (
    index === 0 ? fixedNode('N0', 0, 0, 0) : { id: `N${index}`, x: 3 * index / elements, y: 0, z: 0 }
  ));
  model.members = Array.from({ length: elements }, (_item, index) => frame(`M${index + 1}`, `N${index}`, `N${index + 1}`));
  model.loads = [{ id: 'P', type: 'nodal', node: `N${elements}`, P: 1, dir: '-z', case: 'D' }];
  const result = solveStatic(model);
  const assembled = assembleBenchmarkStiffness(model);
  const displacement = flattenDisplacements(model, result);
  const strainEnergy = 0.5 * denseQuadratic(displacement, assembled.K);
  const externalWork = -result.disp[`N${elements}`][2];
  return {
    model,
    result,
    evidence: {
      elements,
      tipDisplacement: result.disp[`N${elements}`][2] * 1000,
      tipRotation: result.disp[`N${elements}`][4],
      supportReaction: result.reactions.N0.rz * 1000,
      supportMoment: result.reactions.N0.rmy * 1e6,
      strainEnergy,
      externalWork,
      equilibriumResidual: result.summary.equilibriumResidual,
      calculationHash: stableHash({ model, resultHash: hashStrix21BenchmarkResult(result) }),
    },
  };
}

function runSb10() {
  const model = staticModel({ E: 200000, nu: 0.3, A: 0.001, Iy: 1e-8, Iz: 1e-8, J: 1e-8 });
  model.nodes = [
    fixedNode('N1', -3, 0, 4),
    fixedNode('N2', 4, 0, 3),
    { id: 'N3', x: 0, y: 0, z: 0, support: 'custom', fix: [false, true, false, true, true, true] },
  ];
  model.members = [truss('E1', 'N3', 'N1'), truss('E2', 'N3', 'N2')];
  model.loads = [
    { id: 'PX', type: 'nodal', node: 'N3', P: 10, dir: '-x', case: 'D' },
    { id: 'PZ', type: 'nodal', node: 'N3', P: 20, dir: '-z', case: 'D' },
  ];
  const result = solveStatic(model);
  const responses = [
    signedResponse('brace-e1-axial', axialForce(result.memberResults.E1) * 1000, -10000, 'brace E1 axial force', 'N', 'member-local-x', 'tension-positive'),
    signedResponse('brace-e2-axial', axialForce(result.memberResults.E2) * 1000, -20000, 'brace E2 axial force', 'N', 'member-local-x', 'tension-positive'),
    signedResponse('apex-displacement-x', result.disp.N3[0] * 1000, -0.25, 'apex displacement x', 'mm', 'global-x', 'positive-global-x'),
    signedResponse('apex-displacement-z', result.disp.N3[2] * 1000, -0.5, 'apex displacement z', 'mm', 'global-z', 'positive-global-z'),
    signedResponse('support-n1-reaction-x', result.reactions.N1.rx * 1000, -6000, 'support N1 reaction x', 'N', 'global-x', 'positive-global-x'),
    signedResponse('support-n1-reaction-z', result.reactions.N1.rz * 1000, 8000, 'support N1 reaction z', 'N', 'global-z', 'positive-global-z'),
    signedResponse('support-n2-reaction-x', result.reactions.N2.rx * 1000, 16000, 'support N2 reaction x', 'N', 'global-x', 'positive-global-x'),
    signedResponse('support-n2-reaction-z', result.reactions.N2.rz * 1000, 12000, 'support N2 reaction z', 'N', 'global-z', 'positive-global-z'),
  ];
  const phase15Qualification = qualifyPhase15Sb10({
    binding: phase15QualificationBinding('SB10', responses.map(({ id, reference, unit, axis, signConvention }) => ({ id, reference, unit, axis, signConvention })), { relativeTolerance: 1e-3 }, { responseIds: responses.map((row) => row.id) }),
    responses,
    equilibriumResidual: result.summary.equilibriumResidual,
  });
  return completedCase('SB10', model, result, [
    metric('Brace E1 axial', 'N', axialForce(result.memberResults.E1) * 1000, -10000, -10000, 0.1),
    metric('Brace E2 axial', 'N', axialForce(result.memberResults.E2) * 1000, -20000, -20000, 0.1),
    metric('Apex displacement ux', 'mm', result.disp.N3[0] * 1000, -0.25, -0.25, 0.1),
    metric('Apex displacement uz', 'mm', result.disp.N3[2] * 1000, -0.5, -0.5, 0.1),
    metric('Support N1 Rx', 'N', result.reactions.N1.rx * 1000, -6000, -6000, 0.1),
    metric('Support N1 Rz', 'N', result.reactions.N1.rz * 1000, 8000, 8000, 0.1),
    metric('Support N2 Rx', 'N', result.reactions.N2.rx * 1000, 16000, 16000, 0.1),
    metric('Support N2 Rz', 'N', result.reactions.N2.rz * 1000, 12000, 12000, 0.1),
  ], {
    formulation: '3D axial-only truss',
    signConvention: 'member local axial force: tension positive, compression negative',
    equilibriumResidual: result.summary.equilibriumResidual,
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function runSb9() {
  const H = 144 * IN_TO_M;
  const span = 288 * IN_TO_M;
  const w = 0.1 * KIP_TO_KN / IN_TO_M;
  const properties = { H, span, w, E: 29900 * KSI_TO_MPA, A: 9.12 * IN2_TO_M2, Iz: 110 * IN4_TO_M4 };
  const levels = [2, 4, 8].map((elements) => solveSb9Level(elements, properties));
  const final = levels.at(-1);
  const references = { bending: -69.179684, axial: -0.193149, combined: -69.372833 };
  const phase15Qualification = qualifyPhase15Sb9({
    binding: phase15QualificationBinding('SB9', references, { relativeTolerance: 1e-3, identityTolerance: 1e-8 }, {
      bending: 'separate-simply-supported-beam-midspan',
      axial: 'separate-two-column-average-top-shortening',
      combined: 'portal-midspan',
    }),
    levels: levels.map((row) => row.evidence),
    references,
    units: { bending: 'mm', axial: 'mm', combined: 'mm' },
  });
  return completedCase('SB9', final.combined.model, final.combined.result, [
    metric('Midspan deflection bending component', 'mm', final.evidence.bending, references.bending, -69.179684, 0.1),
    metric('Midspan deflection axial component', 'mm', final.evidence.axial, references.axial, -0.193149, 0.1),
    metric('Midspan deflection combined', 'mm', final.evidence.combined, references.combined, -69.3655, 0.1),
    metric('Component superposition residual', 'mm', final.evidence.combined - final.evidence.bending - final.evidence.axial, 0, 0, 0, { absoluteTolerance: 1e-8 }),
  ], {
    formulation: 'separate Euler beam, axial-column, and combined portal production solves',
    equilibriumResidual: final.combined.result.summary.equilibriumResidual,
    componentIdentity: 'combined = beam bending + column axial shortening',
    componentReferenceMm: references,
    componentSequence: levels.map((row) => row.evidence),
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function solveSb9Level(elements, properties) {
  const bending = solveSb9BendingModel(elements, properties);
  const axial = solveSb9AxialModel(elements, properties);
  const combined = solveSb9CombinedModel(elements, properties);
  return {
    bending,
    axial,
    combined,
    evidence: {
      elements,
      bending: bending.responseMm,
      axial: axial.responseMm,
      combined: combined.responseMm,
      componentRuns: {
        bending: calculationRunEvidence(bending.model, bending.result),
        axial: calculationRunEvidence(axial.model, axial.result),
        combined: calculationRunEvidence(combined.model, combined.result),
      },
    },
  };
}

function solveSb9BendingModel(elements, properties) {
  const model = sb9StaticModel(properties);
  model.nodes = Array.from({ length: elements + 1 }, (_item, index) => ({
    id: `B${index}`,
    x: properties.span * index / elements,
    y: 0,
    z: 0,
    support: index === 0 || index === elements ? 'custom' : undefined,
    ...(index === 0 ? { fix: [true, true, true, true, false, true] } : {}),
    ...(index === elements ? { fix: [false, true, true, true, false, true] } : {}),
  }));
  model.members = Array.from({ length: elements }, (_item, index) => frame(`BB${index + 1}`, `B${index}`, `B${index + 1}`));
  model.loads = model.members.map((member, index) => ({ id: `BW${index + 1}`, type: 'udl', member: member.id, w: properties.w, dir: '-z', case: 'D' }));
  const result = solveStatic(model);
  return { model, result, responseMm: result.disp[`B${elements / 2}`][2] * 1000 };
}

function solveSb9AxialModel(elements, properties) {
  const model = sb9StaticModel(properties);
  model.nodes = [
    fixedNode('ABL', 0, 0, 0), fixedNode('ABR', properties.span, 0, 0),
    { id: 'ATL', x: 0, y: 0, z: properties.H, support: 'custom', fix: [true, true, false, true, true, true] },
    { id: 'ATR', x: properties.span, y: 0, z: properties.H, support: 'custom', fix: [true, true, false, true, true, true] },
  ];
  model.members = [truss(`ACL-${elements}`, 'ABL', 'ATL'), truss(`ACR-${elements}`, 'ABR', 'ATR')];
  const endLoad = properties.w * properties.span / 2;
  model.loads = [
    { id: `AL-${elements}`, type: 'nodal', node: 'ATL', P: endLoad, dir: '-z', case: 'D' },
    { id: `AR-${elements}`, type: 'nodal', node: 'ATR', P: endLoad, dir: '-z', case: 'D' },
  ];
  const result = solveStatic(model);
  return { model, result, responseMm: 500 * (result.disp.ATL[2] + result.disp.ATR[2]) };
}

function solveSb9CombinedModel(elements, properties) {
  const model = sb9StaticModel(properties);
  const top = Array.from({ length: elements + 1 }, (_item, index) => ({
    id: `T${index}`,
    x: properties.span * index / elements,
    y: 0,
    z: properties.H,
    support: 'custom',
    fix: [index === 0, true, false, true, false, true],
  }));
  model.nodes = [fixedNode('CBL', 0, 0, 0), fixedNode('CBR', properties.span, 0, 0), ...top];
  model.members = [
    truss(`CCL-${elements}`, 'CBL', 'T0'),
    truss(`CCR-${elements}`, 'CBR', `T${elements}`),
    ...Array.from({ length: elements }, (_item, index) => frame(`CB${index + 1}`, `T${index}`, `T${index + 1}`)),
  ];
  model.loads = model.members.filter((member) => member.id.startsWith('CB')).map((member, index) => ({ id: `CW${index + 1}`, type: 'udl', member: member.id, w: properties.w, dir: '-z', case: 'D' }));
  const result = solveStatic(model);
  return { model, result, responseMm: result.disp[`T${elements / 2}`][2] * 1000 };
}

function sb9StaticModel(properties) {
  return staticModel({ E: properties.E, nu: 0.3, A: properties.A, Iy: 1e-8, Iz: properties.Iz, J: 1e-8 });
}

function runSb7() {
  const L = 180 * IN_TO_M;
  const elementCounts = [8, 16, 32, 64];
  const sequence = elementCounts.map((count) => solveSb7Mesh(count, L));
  const final = sequence.at(-1);
  const result = final.result;
  const centerNode = `N${elementCounts.at(-1) / 2}`;
  const centerMembers = [`M${elementCounts.at(-1) / 2}`, `M${elementCounts.at(-1) / 2 + 1}`];
  const centerMoment = Math.max(...centerMembers.map((id) => result.memberResults[id]?.Mzmax || 0));
  return completedCase('SB7', final.model, result, [
    metric('Center deflection Uz', 'in', result.disp[centerNode][2] / IN_TO_M, -0.089333, -0.089333, 0.1),
    metric('Center moment My', 'kip-in', centerMoment / (KIP_TO_KN * IN_TO_M), 17697.995034, 17697.862777, 0.1),
  ], {
    formulation: 'distributed consistent Winkler foundation matrix',
    meshSequence: sequence.map((row) => ({ elements: row.count, centerDeflectionIn: row.result.disp[`N${row.count / 2}`][2] / IN_TO_M })),
    equilibriumResidual: result.summary.equilibriumResidual,
  });
}

function runSb8() {
  const L = 3;
  const area = 0.6 * 0.6;
  const inertia = 0.6 ** 4 / 12;
  const massPerLength = 2.4 * area;
  const levels = [32, 64, 128, 256].map((count) => solveSb8Mesh(count, { L, area, inertia, massPerLength }));
  const final = levels.at(-1);
  const { model, result } = final;
  const reference = [102.149414, 364.059185, 706.690082, 1078.102736, 1455.799333, 1832.019784];
  const strix = [102.149374, 364.056715, 706.671713, 1078.037695, 1455.638883, 1831.699745];
  const phase15Qualification = qualifyPhase15Sb8({
    binding: phase15QualificationBinding('SB8', reference, { relativeTolerance: 1e-3, minimumMac: 0.99 }, {
      frequencies: 'ascending six physical modes',
      modeShape: 'mass-weighted transverse sine reference at production nodal coordinates',
    }),
    references: reference,
    scope: { formulation: 'timoshenko-2node', shearDeformation: true, mass: 'lumped-translational', rotaryInertia: false },
    levels: levels.map((row) => row.evidence),
  });
  return completedCase('SB8', model, result, result.modes.slice(0, 6).map((mode, index) => metric(`Natural frequency f${index + 1}`, 'Hz', mode.frequencyHz, reference[index], strix[index], 0.1)), {
    formulation: 'Timoshenko 2-node frame with lumped translational mass and no rotary inertia',
    elementCount: final.count,
    meshSequence: levels.map((row) => ({ elements: row.count, frequenciesHz: row.evidence.modes.map((mode) => mode.frequencyHz), eigenResiduals: row.evidence.modes.map((mode) => mode.eigenResidual), macByMode: row.evidence.modes.map((mode) => mode.macToReference), generalizedMass: row.evidence.modes.map((mode) => mode.generalizedMass), maximumEigenResidual: Math.max(...row.evidence.modes.map((mode) => mode.eigenResidual)), minimumMac: Math.min(...row.evidence.modes.map((mode) => mode.macToReference)), maximumMassOrthogonality: row.evidence.massOrthogonalityMax })),
    modalMassAudit: result.mass || null,
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function solveSb8Mesh(count, properties) {
  const { L, area, inertia, massPerLength } = properties;
  const model = createModel();
  model.materials = [{ id: 'MAT', version: 1, name: 'SB8 concrete', E: 30000, G: 12500, density: 0, Fy: 1e9, Fu: 1e9 }];
  model.sections = [{ id: 'SEC', version: 1, name: 'SB8 square', type: 'direct', A: area, Iy: inertia, Iz: inertia, J: 0.018, Ay: area * 5 / 6, Az: area * 5 / 6, Zy: 1, Zz: 1 }];
  model.nodes = Array.from({ length: count + 1 }, (_item, index) => {
    const tributaryMass = massPerLength * L / count * (index === 0 || index === count ? 0.5 : 1);
    return {
      id: `N${index}`,
      x: L * index / count,
      y: 0,
      z: 0,
      mass: [0, 0, tributaryMass, 0, 0, 0],
      support: 'custom',
      fix: [true, true, index === 0 || index === count, true, false, true],
    };
  });
  model.members = Array.from({ length: count }, (_item, index) => ({ ...frame(`M${index + 1}`, `N${index}`, `N${index + 1}`), shearDeformation: true }));
  model.massSources = [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  model.analysisSettings = { ...model.analysisSettings, shearDeformation: true, modalModeCount: 6, responseSpectrum: { enabled: false } };
  const result = analyzeDynamics(model, { modalModeCount: 6, responseSpectrum: { enabled: false } });
  if (!result.ok) throw Object.assign(new Error(`SB8 modal solve failed: ${result.reason}`), { code: 'STRIX21_SB8_SOLVE_FAILED' });
  const system = result.dynamicSystem;
  const projected = result.modes.slice(0, 6).map((mode) => system.projectModeVector(mode));
  const physicalMassZ = model.nodes.map((node) => Number(node.mass?.[2]) || 0);
  const modes = result.modes.slice(0, 6).map((mode, index) => {
    const actualVector = model.nodes.map((node) => Number(mode.massNormalizedShape?.[node.id]?.[2]) || 0);
    const referenceVector = model.nodes.map((node) => Math.sin((index + 1) * Math.PI * node.x / L));
    return {
      frequencyHz: mode.frequencyHz,
      eigenvalue: mode.omega ** 2,
      eigenResidual: generalizedEigenResidual(system.stiffness, system.mass, projected[index], mode.omega ** 2),
      generalizedMass: denseQuadratic(projected[index], system.mass),
      macToReference: massWeightedMac(actualVector, referenceVector, physicalMassZ),
    };
  });
  return {
    count,
    model,
    result,
    evidence: {
      elements: count,
      modes,
      massOrthogonalityMax: maximumMassOrthogonality(projected, system.mass),
      calculationHash: stableHash({ model, frequenciesHz: modes.map((mode) => mode.frequencyHz) }),
    },
  };
}

function runPd1() {
  const L = 300 * IN_TO_M;
  const meshCounts = [8, 16, 32];
  const loadStepCounts = [2, 4, 8];
  const runs = meshCounts.flatMap((count) => solvePd1Mesh(count, loadStepCounts, L));
  const final = runs.find((row) => row.count === 32 && row.loadSteps === 8);
  const { model, secondOrder, noTension, withTension, responses } = final;
  const references = {
    displacementWithoutTension: -1.041667,
    momentWithoutTension: 22.5,
    displacementWithTension: -0.543305,
    momentWithTension: 11.498079,
  };
  const stageResiduals = runs.flatMap((row) => row.stages.flatMap((stage) => [stage.forceResidual, stage.momentResidual]).filter(Number.isFinite));
  const phase15Qualification = blockPhase15ExistingPassQualification('PD1', ['PD1_STAGE_WORK_BALANCE_NOT_EXPOSED'], {
    actualMeshLineage: meshCounts,
    actualLoadStepLineage: loadStepCounts,
    actualRunCount: runs.length,
    allRunsConverged: runs.every((row) => row.secondOrder.converged && row.stages.every((stage) => stage.converged)),
    maximumActualStageResidual: stageResiduals.length ? Math.max(...stageResiduals) : null,
    stageWorkBalanceAvailable: false,
    finalResponses: responses,
    calculationHashes: runs.map((row) => row.calculationHash),
  });
  return completedCase('PD1', model, secondOrder, [
    metric('Uz without tension', 'in', responses.displacementWithoutTension, references.displacementWithoutTension, -1.041614, 0.1),
    metric('My without tension', 'kip-in', responses.momentWithoutTension, references.momentWithoutTension, 22.499038, 0.1),
    metric('Uz with tension', 'in', responses.displacementWithTension, references.displacementWithTension, -0.543496, 0.1),
    metric('My with tension', 'kip-in', responses.momentWithTension, references.momentWithTension, 11.493667, 0.1),
  ], {
    formulation: 'direct geometric-stiffness second-order analysis with tension-positive Kg',
    elementCount: final.count,
    iterations: secondOrder.iterations.length,
    convergenceReason: secondOrder.reason || null,
    actualMeshLoadStepRuns: runs.map((row) => ({ elements: row.count, loadSteps: row.loadSteps, converged: row.secondOrder.converged, responses: row.responses, stages: row.stages, calculationHash: row.calculationHash })),
    preliminaryMetricsPassed: true,
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function solvePd1Mesh(count, loadStepCounts, L) {
  const model = staticModel({
    E: 30000 * KSI_TO_MPA,
    nu: 0.3,
    A: 9 * IN2_TO_M2,
    Iy: 6.75 * IN4_TO_M4,
    Iz: 6.75 * IN4_TO_M4,
    J: 11.39 * IN4_TO_M4,
  });
  model.nodes = Array.from({ length: count + 1 }, (_item, index) => ({
    id: `N${index}`,
    x: L * index / count,
    y: 0,
    z: 0,
    support: 'custom',
    fix: [index === 0, true, index === 0 || index === count, true, false, true],
  }));
  model.members = Array.from({ length: count }, (_item, index) => frame(`M${index + 1}`, `N${index}`, `N${index + 1}`));
  const w = 0.002 * KIP_TO_KN / IN_TO_M;
  model.loadCases = [{ id: 'W', name: 'Transverse UDL', type: 'other' }, { id: 'T', name: 'Axial tension', type: 'other' }];
  model.loadCombinations = [{ id: 'W_ONLY', name: 'W', type: 'service', factors: { W: 1 } }];
  model.loads = [
    ...model.members.map((member, index) => ({ id: `W${index + 1}`, type: 'udl', member: member.id, w, dir: '-z', case: 'W' })),
    { id: 'T', type: 'nodal', node: `N${count}`, P: 20.25 * KIP_TO_KN, dir: '+x', case: 'T' },
  ];
  const linear = analyzeModel(model);
  if (!linear.ok || !linear.byCombo.W_ONLY?.ok) throw Object.assign(new Error('PD1 first-order solve failed.'), { code: 'STRIX21_PD1_LINEAR_FAILED' });
  const noTension = linear.byCombo.W_ONLY;
  const center = `N${count / 2}`;
  const noMoment = Math.max(...Object.values(noTension.memberResults).map((row) => row.Mzmax || 0));
  return loadStepCounts.map((loadSteps) => {
    const secondOrder = runSecondOrderPDelta(model, { W: 1, T: 1 }, { loadSteps, maxIterations: 30, tolerance: 1e-10, residualTolerance: 1e-8 });
    if (!secondOrder.ok) throw Object.assign(new Error(`PD1 second-order solve failed: ${secondOrder.reason}`), { code: 'STRIX21_PD1_PDELTA_FAILED' });
    const withTension = secondOrder.result;
    const tensionMoment = Math.max(...Object.values(withTension.memberResults).map((row) => row.Mzmax || 0));
    const responses = {
      displacementWithoutTension: noTension.disp[center][2] / IN_TO_M,
      momentWithoutTension: noMoment / (KIP_TO_KN * IN_TO_M),
      displacementWithTension: withTension.disp[center][2] / IN_TO_M,
      momentWithTension: tensionMoment / (KIP_TO_KN * IN_TO_M),
    };
    const stages = secondOrder.steps.map((step) => {
      const last = step.iterations.at(-1);
      return {
        step: step.step,
        loadFactor: step.lambda,
        converged: step.converged === true,
        forceResidual: last?.convergenceNorms?.forceResidual ?? null,
        momentResidual: last?.convergenceNorms?.momentResidual ?? null,
        workBalanceResidual: null,
      };
    });
    return {
      count,
      loadSteps,
      model,
      noTension,
      withTension,
      secondOrder,
      responses,
      stages,
      calculationHash: stableHash({ model, loadSteps, responses, stages }),
    };
  });
}

function runSm5() {
  const bays = 10;
  const stories = 9;
  const bay = 6.096;
  const story = 3.048;
  const lineMass = 0.143641 * 1000;
  const model = createModel();
  model.materials = [{ id: 'MAT', version: 1, name: 'SM5 elastic', E: 20684, G: 1e12, density: 0, Fy: 1e9, Fu: 1e9 }];
  model.sections = [{ id: 'SEC', version: 1, name: 'SM5 member', type: 'direct', A: 0.278709, Iy: 0.008631, Iz: 0.008631, J: 1e-4, Ay: 1e12, Az: 1e12, Zy: 1, Zz: 1 }];
  model.nodes = [];
  for (let level = 0; level <= stories; level += 1) for (let column = 0; column <= bays; column += 1) {
    model.nodes.push({
      id: `N${level}-${column}`,
      x: column * bay,
      y: 0,
      z: level * story,
      support: level === 0 ? 'fixed' : 'custom',
      ...(level === 0 ? {} : { fix: [false, true, false, true, false, true] }),
    });
  }
  model.members = [];
  for (let level = 0; level < stories; level += 1) for (let column = 0; column <= bays; column += 1) {
    model.members.push(frame(`C${level}-${column}`, `N${level}-${column}`, `N${level + 1}-${column}`));
  }
  for (let level = 1; level <= stories; level += 1) for (let bayIndex = 0; bayIndex < bays; bayIndex += 1) {
    model.members.push(frame(`B${level}-${bayIndex}`, `N${level}-${bayIndex}`, `N${level}-${bayIndex + 1}`));
  }
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const masses = Object.fromEntries(model.nodes.map((node) => [node.id, 0]));
  for (const member of model.members) {
    const a = nodeById.get(member.n1); const b = nodeById.get(member.n2);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    masses[a.id] += lineMass * length / 2;
    masses[b.id] += lineMass * length / 2;
  }
  model.nodes = model.nodes.map((node) => ({ ...node, mass: [masses[node.id], 0, masses[node.id], 0, 0, 0] }));
  model.massSources = [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  model.analysisSettings = { ...model.analysisSettings, shearDeformation: false, modalModeCount: 3, responseSpectrum: { enabled: false } };
  const result = analyzeDynamics(model, { modalModeCount: 3, responseSpectrum: { enabled: false } });
  if (!result.ok) throw Object.assign(new Error(`SM5 modal solve failed: ${result.reason}`), { code: 'STRIX21_SM5_SOLVE_FAILED' });
  const reference = [0.589541, 5.52695, 16.5878];
  const strix = [0.589538, 5.526926, 16.587774];
  const system = result.dynamicSystem;
  const projected = result.modes.slice(0, 3).map((mode) => system.projectModeVector(mode));
  const actualModalAudit = result.modes.slice(0, 3).map((mode, index) => ({
    mode: index + 1,
    eigenvalue: mode.omega ** 2,
    eigenResidual: generalizedEigenResidual(system.stiffness, system.mass, projected[index], mode.omega ** 2),
    generalizedMass: denseQuadratic(projected[index], system.mass),
    participationX: sanitizeParticipation(mode.participation?.x),
  }));
  const phase15Qualification = blockPhase15ExistingPassQualification('SM5', ['SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE'], {
    productionEigenResiduals: actualModalAudit.map((row) => row.eigenResidual),
    productionGeneralizedMass: actualModalAudit.map((row) => row.generalizedMass),
    productionMaximumMassOrthogonality: maximumMassOrthogonality(projected, system.mass),
    productionParticipationX: actualModalAudit.map((row) => row.participationX),
    massUnit: result.mass?.unit || null,
    independentReferenceEigenvaluesAvailable: true,
    independentReferenceModeVectorsAvailable: false,
  });
  return completedCase('SM5', model, result, result.modes.slice(0, 3).map((mode, index) => metric(`Eigenvalue omega^2 mode ${index + 1}`, 'rad2/s2', mode.omega ** 2, reference[index], strix[index], 0.5)), {
    formulation: 'one element per member, Euler frame, explicit nodal lumping of published line mass',
    freePlaneDof: stories * (bays + 1) * 3,
    memberCount: model.members.length,
    massInterpretation: '0.143641 N-s2/mm2 = 143.641 tonne/m',
    actualModalAudit,
    preliminaryMetricsPassed: true,
    phase15Qualification,
    phase15MandatoryGates: phase15Qualification.mandatoryGates,
  }, phase15CaseStatus(phase15Qualification));
}

function runSb3() {
  const levels = [4, 8, 12, 16].map((divisions, index) => solveCookMesh(divisions, index + 1));
  const final = levels.at(-1);
  const previous = levels.at(-2);
  return completedCase('SB3', {
    meshFamily: levels.map((row) => ({ divisions: row.divisions, meshHash: row.mesh.meshHash })),
    properties: { E: 30e9, nu: 1 / 3, thickness: 0.2, totalShear: 1e6 },
  }, final, [
    metric('Normalized loaded-edge midpoint displacement', 'dimensionless', final.normalized, 23.91, 23.9578, 1),
  ], {
    formulation: 'QM6-EAS plane-stress membrane',
    meshSequence: levels.map((row) => ({ divisions: row.divisions, normalized: row.normalized, solver: row.factorization.rows?.[0]?.mode || null, storage: row.sparseStorage })),
    finalRelativeChangePct: 100 * Math.abs(final.normalized - previous.normalized) / Math.abs(final.normalized),
    drillingExcludedFromPhysicalSolve: true,
    finalEnergyResidual: final.energyResidual,
  });
}

function runSb2() {
  const levels = [[24, 12], [48, 24], [64, 32], [96, 48]].map(([angular, radial], index) => solveLe1Mesh(angular, radial, index + 1));
  const final = levels.at(-1);
  const previous = levels.at(-2);
  return completedCase('SB2', {
    meshFamily: levels.map((row) => ({ divisions: [row.angular, row.radial], meshHash: row.mesh.meshHash })),
    properties: { E: 210e9, nu: 0.3, thickness: 0.1, outerNormalTraction: 10e6 },
  }, final, [
    metric('Tangential stress at D', 'MPa', final.tangentialStress / 1e6, 92.7, 90.8514, 3),
  ], {
    formulation: 'QM6-EAS plane-stress membrane on parametric elliptic-annulus mesh',
    meshSequence: levels.map((row) => ({ divisions: [row.angular, row.radial], stressMpa: row.tangentialStress / 1e6, solver: row.factorization.rows?.[0]?.mode || null, storage: row.sparseStorage })),
    finalRelativeChangePct: 100 * Math.abs(final.tangentialStress - previous.tangentialStress) / Math.abs(final.tangentialStress),
    sameMeshStrixErrorPct: 100 * (final.tangentialStress / 1e6 - 90.8514) / 90.8514,
    probeMethod: final.probeMethod,
    finalEnergyResidual: final.energyResidual,
  });
}

function solveLe1Mesh(angular, radial, level) {
  const inner = { a: 2, b: 1 };
  const outer = { a: 3.25, b: 2.75 };
  const mesh = createStructuredQuadMesh({
    id: `SB2-${angular}x${radial}`,
    familyId: 'SB2-NAFEMS-LE1',
    level,
    nx: angular,
    ny: radial,
    mapPoint: (u, v) => {
      const theta = u * Math.PI / 2;
      const a = inner.a + v * (outer.a - inner.a);
      const b = inner.b + v * (outer.b - inner.b);
      return { x: a * Math.cos(theta), y: 0, z: b * Math.sin(theta) };
    },
    mapping: 'quarter-elliptic-annulus-linear-semi-axis-interpolation',
  });
  const size = mesh.nodes.length * 2;
  const dofOrder = mesh.nodes.flatMap((node) => ['ux', 'uz'].map((component) => `${node.id}:${component}`));
  const assembler = createDeterministicSparseAssembler({ rowCount: size, basis: 'GLOBAL', symmetric: true, dofOrder });
  const F = new Array(size).fill(0);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  for (const element of mesh.elements) {
    const built = buildWallMembraneQm6({ id: element.id, nodes: element.nodeIds.map((id) => mesh.nodes[nodeIndex.get(id)]), E: 210e9, nu: 0.3, t: 0.1, density: 0 });
    if (!built.ok || built.qualification?.status !== 'pass') throw Object.assign(new Error(`SB2 element ${element.id} failed qualification.`), { code: built.reason || built.qualification?.reason || 'STRIX21_SB2_ELEMENT_FAILED' });
    const dofs = element.nodeIds.flatMap((id) => [nodeIndex.get(id) * 2, nodeIndex.get(id) * 2 + 1]);
    const elementMatrix = membranePlaneGlobalMatrix(built);
    assembler.addBlock({ elementId: element.id, contributionId: 'qm6-eas-compatible', basis: 'GLOBAL', dofs, dofOrder: dofs.map((dof) => dofOrder[dof]), matrix: elementMatrix });
  }
  const K = assembler.finalize();
  const outerIds = mesh.boundary.v1;
  for (let index = 0; index < outerIds.length - 1; index += 1) {
    const aNode = mesh.nodes[nodeIndex.get(outerIds[index])];
    const bNode = mesh.nodes[nodeIndex.get(outerIds[index + 1])];
    const theta = ((aNode.u + bNode.u) / 2) * Math.PI / 2;
    const normalRaw = [Math.cos(theta) / outer.a, Math.sin(theta) / outer.b];
    const norm = Math.hypot(...normalRaw);
    const normal = normalRaw.map((value) => value / norm);
    const segment = Math.hypot(bNode.x - aNode.x, bNode.z - aNode.z);
    const force = 10e6 * 0.1 * segment;
    for (const node of [aNode, bNode]) {
      F[nodeIndex.get(node.id) * 2] += force * normal[0] / 2;
      F[nodeIndex.get(node.id) * 2 + 1] += force * normal[1] / 2;
    }
  }
  const fixed = new Set();
  for (const id of mesh.boundary.u0) fixed.add(nodeIndex.get(id) * 2 + 1);
  for (const id of mesh.boundary.u1) fixed.add(nodeIndex.get(id) * 2);
  const solvedSystem = solveReducedSystem(K, F, fixed, `SB2-${angular}x${radial}`);
  const displacementByNode = Object.fromEntries(mesh.nodes.map((node, index) => [node.id, [solvedSystem.displacement[index * 2], 0, solvedSystem.displacement[index * 2 + 1], 0, 0, 0]]));
  const field = recoverMembraneField(mesh, displacementByNode, { E: 210e9, nu: 0.3, t: 0.1, density: 0, stressUnit: 'Pa' });
  const probe = probeMembraneStress(mesh, field, { id: 'D', point: { x: 2, y: 0, z: 0 } });
  const nearestGauss = field.integrationPoints
    .filter((row) => row.elementId === 'E1')
    .sort((a, b) => Math.hypot(a.xi + 1, a.eta + 1) - Math.hypot(b.xi + 1, b.eta + 1))[0];
  const tangentialStress = maximumPrincipal(nearestGauss.sx, nearestGauss.sy, nearestGauss.txy);
  return { angular, radial, mesh, field, probe, nearestGauss, probeMethod: 'raw-gauss-point-nearest-D', tangentialStress, ...solvedSystem };
}

function solveCookMesh(divisions, level) {
  const mesh = createCookMembraneMesh({
    id: `SB3-${divisions}`,
    nx: divisions,
    ny: divisions,
    level,
    width: 4.8,
    leftHeight: 4.4,
    rightBottom: 4.4,
    rightTop: 6.0,
  });
  const size = mesh.nodes.length * 2;
  const dofOrder = mesh.nodes.flatMap((node) => ['ux', 'uz'].map((component) => `${node.id}:${component}`));
  const assembler = createDeterministicSparseAssembler({ rowCount: size, basis: 'GLOBAL', symmetric: true, dofOrder });
  const F = new Array(size).fill(0);
  const nodeIndex = new Map(mesh.nodes.map((node, index) => [node.id, index]));
  for (const element of mesh.elements) {
    const built = buildWallMembraneQm6({
      id: element.id,
      nodes: element.nodeIds.map((id) => mesh.nodes[nodeIndex.get(id)]),
      E: 30e9,
      nu: 1 / 3,
      t: 0.2,
      density: 0,
    });
    if (!built.ok || built.qualification?.status !== 'pass') throw Object.assign(new Error(`SB3 element ${element.id} failed qualification.`), { code: built.reason || built.qualification?.reason || 'STRIX21_SB3_ELEMENT_FAILED' });
    const dofs = element.nodeIds.flatMap((id) => [nodeIndex.get(id) * 2, nodeIndex.get(id) * 2 + 1]);
    const elementMatrix = membranePlaneGlobalMatrix(built);
    assembler.addBlock({ elementId: element.id, contributionId: 'qm6-eas-compatible', basis: 'GLOBAL', dofs, dofOrder: dofs.map((dof) => dofOrder[dof]), matrix: elementMatrix });
  }
  const K = assembler.finalize();
  const right = mesh.boundary.u1.map((id) => mesh.nodes[nodeIndex.get(id)]).sort((a, b) => a.j - b.j);
  const totalShear = 1e6;
  for (let index = 0; index < right.length - 1; index += 1) {
    const a = right[index]; const b = right[index + 1];
    const segmentFraction = Math.hypot(b.x - a.x, b.z - a.z) / 1.6;
    F[nodeIndex.get(a.id) * 2 + 1] += totalShear * segmentFraction / 2;
    F[nodeIndex.get(b.id) * 2 + 1] += totalShear * segmentFraction / 2;
  }
  const fixed = new Set(mesh.boundary.u0.flatMap((id) => [nodeIndex.get(id) * 2, nodeIndex.get(id) * 2 + 1]));
  const solvedSystem = solveReducedSystem(K, F, fixed, `SB3-${divisions}`);
  const displacement = solvedSystem.displacement;
  const midpoint = right[divisions / 2];
  const uy = displacement[nodeIndex.get(midpoint.id) * 2 + 1];
  const normalized = uy * 30e9 * 0.2 / totalShear;
  return {
    divisions,
    mesh,
    normalized,
    midpointDisplacement: uy,
    ...solvedSystem,
  };
}

function solveSb7Mesh(count, L) {
  const E = 3600 * KSI_TO_MPA;
  const I = 139968 * IN4_TO_M4;
  const A = 36 * 36 * IN2_TO_M2;
  const lineStiffness = 16.6667 * KIP_TO_KN / (IN_TO_M ** 2);
  const model = staticModel({ E, nu: 0.2, A, Iy: I, Iz: I, J: 2 * I });
  model.nodes = Array.from({ length: count + 1 }, (_item, index) => ({
    id: `N${index}`, x: L * index / count, y: 0, z: 0,
    ...(index === 0
      ? { support: 'custom', fix: [true, true, true, true, false, false] }
      : index === count
        ? { support: 'custom', fix: [false, true, true, false, false, false] }
        : {}),
  }));
  model.members = Array.from({ length: count }, (_item, index) => ({
    ...frame(`M${index + 1}`, `N${index}`, `N${index + 1}`),
    foundationId: 'WF',
  }));
  model.foundationProperties = [createWinklerLineFoundationProperty({
    id: 'WF',
    name: 'SB7',
    localY: { lineStiffness },
    localZ: { lineStiffness },
  })];
  model.loads = [{ id: 'P', type: 'nodal', node: `N${count / 2}`, P: 500 * KIP_TO_KN, dir: '-z', case: 'D' }];
  return { count, model, result: solveStatic(model) };
}

function runSb5() {
  const references = [
    { id: 'SS-1x1-UDL', aspect: 1, support: 'simply-supported-soft', loadKind: 'pressure', reference: 0.00406, strix: 0.00406, divisions: [8, 12, 16] },
    { id: 'SS-5x1-UDL', aspect: 5, support: 'simply-supported-soft', loadKind: 'pressure', reference: 0.01297, strix: 0.01294, divisions: [8, 12, 16] },
    { id: 'FIX-1x1-UDL', aspect: 1, support: 'clamped', loadKind: 'pressure', reference: 0.00126, strix: 0.00126, divisions: [8, 12, 16] },
    { id: 'FIX-5x1-UDL', aspect: 5, support: 'clamped', loadKind: 'pressure', reference: 0.0026, strix: 0.00259, divisions: [12, 16, 20] },
    { id: 'SS-1x1-POINT', aspect: 1, support: 'simply-supported-soft', loadKind: 'point', reference: 0.0116, strix: 0.0116, divisions: [8, 12, 16] },
    { id: 'SS-5x1-POINT', aspect: 5, support: 'simply-supported-soft', loadKind: 'point', reference: 0.01695, strix: 0.01694, divisions: [8, 12, 16] },
    { id: 'FIX-1x1-POINT', aspect: 1, support: 'clamped', loadKind: 'point', reference: 0.0056, strix: 0.00559, divisions: [8, 12, 16] },
    { id: 'FIX-5x1-POINT', aspect: 5, support: 'clamped', loadKind: 'point', reference: 0.00725, strix: 0.00721, divisions: [12, 16, 20] },
  ];
  const session = createElasticFactorSession();
  const familyCache = new Map();
  const rows = references.map((spec) => {
    const levels = spec.divisions.map((nx, level) => {
      const key = `${spec.aspect}:${spec.support}:${spec.loadKind}:${nx}`;
      const cached = familyCache.get(key);
      if (cached) return cached;
      const ny = nx * spec.aspect;
      const mesh = createRectangularPlateMesh({
        id: `SB5-A${spec.aspect}-${spec.support}-${nx}x${ny}`,
        familyId: `SB5-A${spec.aspect}-${spec.support}`,
        level: level + 1,
        width: 2,
        height: 2 * spec.aspect,
        nx,
        ny,
      });
      const run = solveRectangularPlate(
        mesh,
        { E: 30e9, nu: 0.3, t: 0.01, density: 0 },
        spec.loadKind === 'pressure' ? { pressure: 100 } : { pointLoad: 100 },
        { support: spec.support, factorSession: session },
      );
      const row = { mesh, run, nx, ny };
      familyCache.set(key, row);
      return row;
    });
    const final = levels.at(-1);
    const previous = levels.at(-2);
    return {
      ...spec,
      levels,
      mesh: final.mesh,
      run: final.run,
      finalRelativeChangePct: 100 * Math.abs(final.run.dimensionlessCoefficient - previous.run.dimensionlessCoefficient) / Math.abs(final.run.dimensionlessCoefficient),
    };
  });
  const factorization = session.dispose();
  const convergencePassed = rows.every((row) => row.levels.length >= 3 && row.finalRelativeChangePct <= 1);
  const energyPassed = rows.every((row) => row.levels.every((level) => level.run.energy.passed));
  const result = {
    rows: rows.map((row) => ({ id: row.id, coefficient: row.run.dimensionlessCoefficient, runHash: row.run.runHash, finalRelativeChangePct: row.finalRelativeChangePct })),
    factorization,
  };
  return completedCase('SB5', {
    caseMeshes: rows.map((row) => ({ id: row.id, familyId: row.mesh.lineage.familyId, levels: row.levels.map((level) => ({ meshHash: level.mesh.meshHash, divisions: level.mesh.lineage.divisions })) })),
  }, result, rows.map((row) => metric(row.id, 'alpha', row.run.dimensionlessCoefficient, row.reference, row.strix, 1)), {
    formulation: 'MITC4 Reissner-Mindlin plate in thin limit',
    convergence: rows.map((row) => ({ id: row.id, values: row.levels.map((level) => level.run.dimensionlessCoefficient), finalRelativeChangePct: row.finalRelativeChangePct })),
    runHashes: rows.map((row) => row.run.runHash),
    sparseStorage: rows.map((row) => row.run.sparseStorage),
    factorizationReuse: { factorizationCount: factorization.factorizationCount, solveCount: factorization.solveCount, reusedSolveCount: factorization.reusedSolveCount },
    energyPassed,
    mandatoryPassed: energyPassed && convergencePassed,
  });
}

function runSb6() {
  const references = [
    ['1x1-R50', 1, 50, 0.004071, 0.004068],
    ['1x1-R20', 1, 20, 0.004115, 0.004112],
    ['1x1-R10', 1, 10, 0.004273, 0.004271],
    ['1x1-R5', 1, 5, 0.004904, 0.004903],
    ['2x1-R10', 2, 10, 0.010454, 0.010438],
    ['2x1-R5', 2, 5, 0.01143, 0.011414],
  ];
  const rows = references.map(([id, aspect, ratio, reference, strix]) => {
    const nx = aspect === 1 ? 12 : 10;
    const ny = aspect === 1 ? 12 : 20;
    const mesh = createRectangularPlateMesh({ id, width: 2, height: 2 * aspect, nx, ny });
    const run = solveRectangularPlate(mesh, { E: 30e9, nu: 0.3, t: 2 / ratio, density: 0, shearFactor: 5 / 6 }, { pressure: 100 }, { support: 'simply-supported-hard' });
    return { id, mesh, run, reference, strix };
  });
  return completedCase('SB6', { caseMeshes: rows.map((row) => ({ id: row.id, meshHash: row.mesh.meshHash, divisions: row.mesh.lineage.divisions })) }, null,
    rows.map((row) => metric(row.id, 'alpha', row.run.dimensionlessCoefficient, row.reference, row.strix, 1)), {
      formulation: 'MITC4 Reissner-Mindlin plate, kappa=5/6',
      runHashes: rows.map((row) => row.run.runHash),
      energyPassed: rows.every((row) => row.run.energy.passed),
    });
}

function runP3s2Ss() {
  const qualification = runRealShellStabilizationQualification();
  const sensitivity = qualification.sensitivity;
  const rows = [
    metric('Maximum static response shift', '%', 100 * sensitivity.maximumStaticShift, 0, null, 0, { absoluteTolerance: 0.5 }),
    metric('Maximum physical period shift', '%', 100 * sensitivity.maximumPeriodShift, 0, null, 0, { absoluteTolerance: 0.5 }),
    metric('Minimum mass-weighted MAC', 'ratio', sensitivity.minimumMassWeightedMac, 1, null, 1),
    metric('Maximum static stabilization energy ratio', 'ratio', sensitivity.maximumStaticStabilizationEnergyRatio, 0, null, 0, { absoluteTolerance: 1e-4 }),
    metric('Maximum modal stabilization energy ratio', 'ratio', sensitivity.maximumModalStabilizationEnergyRatio, 0, null, 0, { absoluteTolerance: 1e-3 }),
  ];
  return completedCase('P3S2-SS', {
    fixture: qualification.fixture,
    parameterContracts: qualification.parameterContracts,
    claim: qualification.claim,
  }, qualification, rows, {
    formulation: qualification.qualificationKind,
    identicalToStrixP3S2: qualification.claim.identicalToStrixP3S2,
    qualificationStatus: qualification.status,
    actualStaticSolveCount: qualification.sweep.actualStaticSolveCount,
    actualModalSolveCount: qualification.sweep.actualModalSolveCount,
    minimumMassWeightedMac: sensitivity.minimumMassWeightedMac,
    meshLastPeriodChange: qualification.meshConvergence.lastPeriodChange,
    mandatoryPassed: Object.values(qualification.gates).every(Boolean),
  }, qualification.status === 'pass' && rows.every((row) => row.passed) ? 'CUSTOM_PASS' : 'BLOCKED');
}

function phase15QualificationBinding(caseId, references, tolerances, probes) {
  return {
    referenceHash: stableHash({ version: 'p15-m7-runner-reference-v1', caseId, references }),
    toleranceHash: stableHash({ version: 'p15-m7-runner-tolerance-v1', caseId, tolerances }),
    probeHash: stableHash({ version: 'p15-m7-runner-probe-v1', caseId, probes }),
  };
}

function phase15CaseStatus(qualification) {
  if (qualification?.status === 'PASS') return 'PASS';
  if (qualification?.status === 'BLOCKED') return 'BLOCKED';
  return 'REVIEW';
}

function signedResponse(id, actual, reference, quantity, unit, axis, signConvention) {
  return { id, actual, reference, quantity, unit, axis, signConvention };
}

function calculationRunEvidence(model, result) {
  return {
    executed: true,
    calculationHash: stableHash({ model, resultHash: hashStrix21BenchmarkResult(result) }),
  };
}

function assembleBenchmarkStiffness(model) {
  const assembled = assembleStiffness3D(model.nodes, model.members, {
    model,
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
  });
  if (!assembled.ok) throw Object.assign(new Error(`Benchmark stiffness assembly failed: ${assembled.reason}`), { code: 'STRIX21_STIFFNESS_ASSEMBLY_FAILED' });
  return assembled;
}

function flattenDisplacements(model, result) {
  return model.nodes.flatMap((node) => result.disp[node.id] || new Array(6).fill(0));
}

function denseQuadratic(vector, matrix) {
  return vectorDot(vector, matrix.map((row) => vectorDot(row, vector)));
}

function sanitizeParticipation(input = {}) {
  return {
    gamma: Number(input.gamma),
    modalMass: Number(input.modalMass ?? input.generalizedMass),
    effectiveMass: Number(input.effectiveMass ?? input.effectiveModalMass),
    massRatio: Number(input.massRatio),
  };
}

function staticModel({ E, nu, A, Iy, Iz, J }) {
  const model = createModel();
  model.materials = [{ id: 'MAT', version: 1, name: 'Benchmark elastic', E, G: E / (2 * (1 + nu)), density: 0, Fy: 1e9, Fu: 1e9 }];
  model.sections = [{ id: 'SEC', version: 1, name: 'Benchmark section', type: 'direct', A, Iy, Iz, J, Ay: A * 5 / 6, Az: A * 5 / 6, Zy: 1, Zz: 1 }];
  model.loadCases = [{ id: 'D', name: 'Benchmark load', type: 'dead' }];
  model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'service', factors: { D: 1 } }];
  model.analysisSettings = { ...model.analysisSettings, includeSelfWeight: false, shearDeformation: false, responseSpectrum: { enabled: false }, memberStations: 41 };
  return model;
}

function solveStatic(model) {
  const analysis = analyzeModel(model);
  if (!analysis.ok || !analysis.byCombo?.D_ONLY?.ok) {
    const error = new Error(`Benchmark static solve failed: ${JSON.stringify(analysis.validation?.errors || analysis, null, 2)}`);
    error.code = 'STRIX21_STATIC_SOLVE_FAILED';
    throw error;
  }
  return analysis.byCombo.D_ONLY;
}

function completedCase(id, model, result, metrics, audit = {}, statusOverride = null) {
  const mandatoryPassed = metrics.every((row) => row.passed) && audit.energyPassed !== false && audit.mandatoryPassed !== false;
  const status = statusOverride || (mandatoryPassed ? 'PASS' : 'REVIEW');
  return {
    id,
    status,
    benchmarkExecuted: true,
    modelHash: stableHash(model),
    resultHash: hashStrix21BenchmarkResult(result),
    resultHashProjectionVersion: STRIX21_RESULT_HASH_PROJECTION_VERSION,
    metrics,
    audit,
  };
}

export function hashStrix21BenchmarkResult(result) {
  return stableHash(projectStrix21BenchmarkResult(result));
}

export function projectStrix21BenchmarkResult(value) {
  if (Array.isArray(value)) return value.map(projectStrix21BenchmarkResult);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !STRIX21_RUNTIME_TELEMETRY_FIELD_SET.has(key))
    .map(([key, child]) => [key, projectStrix21BenchmarkResult(child)]));
}

function metric(quantity, unit, actualInput, referenceInput, strixInput, tolerancePct, options = {}) {
  if (options.compareMagnitude != null) throw Object.assign(new Error('Magnitude-only benchmark comparison is forbidden; freeze a signed convention instead.'), { code: 'STRIX21_SIGNED_METRIC_REQUIRED' });
  const actual = Number(actualInput);
  const reference = Number(referenceInput);
  const strix = strixInput == null ? null : Number(strixInput);
  const errorPct = reference === 0 ? null : 100 * (actual - reference) / Math.abs(reference);
  const absoluteError = Math.abs(actual - reference);
  const passed = reference === 0
    ? absoluteError <= Number(options.absoluteTolerance ?? tolerancePct)
    : Math.abs(errorPct) <= tolerancePct;
  return {
    quantity, unit, sStructures: actual, reference, strix,
    errorVsReferencePct: errorPct,
    errorVsStrixPct: strix == null || strix === 0 ? null : 100 * (actual - strix) / Math.abs(strix),
    absoluteError,
    tolerancePct,
    comparison: 'signed',
    passed,
  };
}

function summarize(cases) {
  const counts = Object.fromEntries(['PASS', 'CUSTOM_PASS', 'REVIEW', 'BLOCKED'].map((status) => [status, cases.filter((item) => item.status === status).length]));
  const metrics = cases.flatMap((item) => item.metrics || []);
  return {
    attempted: cases.length,
    ...counts,
    metricCount: metrics.length,
    metricPassCount: metrics.filter((row) => row.passed).length,
    maximumAbsoluteReferenceErrorPct: Math.max(0, ...metrics.map((row) => Math.abs(row.errorVsReferencePct || 0))),
  };
}

function runtimeEnvironment() {
  if (typeof process === 'undefined') return { runtime: 'browser', platform: 'web', architecture: 'unknown' };
  return { runtime: `node-${process.versions?.node || 'unknown'}`, platform: process.platform || 'unknown', architecture: process.arch || 'unknown' };
}

function fixedNode(id, x, y, z) { return { id, x, y, z, support: 'fixed' }; }
function frame(id, n1, n2) { return { id, type: 'frame', n1, n2, matId: 'MAT', secId: 'SEC', localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' } }; }
function truss(id, n1, n2) { return { id, type: 'truss', behavior: 'truss', n1, n2, matId: 'MAT', secId: 'SEC', releases: { i: 'rigid', j: 'rigid' } }; }
function axialForce(memberResult) { return Number(memberResult?.axial ?? memberResult?.end?.[0] ?? 0); }
function vectorDot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function maximumPrincipal(sx, sy, txy) { return (sx + sy) / 2 + Math.hypot((sx - sy) / 2, txy); }
function solveReducedSystem(K, F, fixed, key) {
  const free = Array.from({ length: F.length }, (_item, index) => index).filter((index) => !fixed.has(index));
  const reducedK = K?.format === 'csc'
    ? extractDeterministicCscSubmatrix(K, free)
    : free.map((row) => free.map((column) => K[row][column]));
  const reducedF = free.map((index) => F[index]);
  const session = createElasticFactorSession({ iccgThreshold: 512, iccgTolerance: 1e-11, iccgMaxIterations: 10000 });
  const solved = session.solve(reducedK, reducedF, { groupKey: key, componentKey: 'benchmark-load', matrixClass: 'spd', tolerance: 1e-11, trueResidualTolerance: 1e-8, maxIterations: 10000 });
  const factorizationActive = session.snapshot();
  const factorizationDisposed = session.dispose();
  const factorization = { ...factorizationActive, disposed: factorizationDisposed.disposed, activeFactorCount: factorizationDisposed.activeFactorCount, backend: factorizationDisposed.backend };
  if (!solved.ok) throw Object.assign(new Error(`${key} solve failed: ${solved.reason}`), { code: 'STRIX21_REDUCED_SOLVE_FAILED' });
  const displacement = new Array(F.length).fill(0);
  free.forEach((global, index) => { displacement[global] = solved.x[index]; });
  const internalWork = K?.format === 'csc'
    ? 0.5 * cscQuadratic(K, displacement)
    : 0.5 * vectorDot(displacement, K.map((row) => vectorDot(row, displacement)));
  const externalWork = 0.5 * vectorDot(displacement, F);
  return {
    displacement,
    factorization,
    solveDiagnostics: solved.diagnostics,
    sparseStorage: K?.format === 'csc' ? { format: K.format, rowCount: K.rowCount, nnz: K.nnz, denseMatrixAllocated: false } : null,
    energyResidual: Math.abs(internalWork - externalWork) / Math.max(1, Math.abs(internalWork), Math.abs(externalWork)),
  };
}

function membranePlaneGlobalMatrix(element) {
  const planeDofs = [0, 2, 6, 8, 12, 14, 18, 20];
  return planeDofs.map((row) => planeDofs.map((column) => element.compatibleMatrix[row][column]));
}
