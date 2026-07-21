import { stableHash } from '../../core/stableHash.js';
import { validateModel } from '../../core/validation.js';
import { createBenchmarkModel } from '../../examples/verification.js';
import { analyzeDynamics } from '../../dynamics/modal.js';
import { analyzeModel } from '../../solver/linear3d.js';
import {
  VERIFICATION_MATRIX_RECORD_VERSION,
  modelHash,
} from '../matrix/record.js';
import { P10_XVAL_SOLVER_VERSION } from './runner.js';

export const P10_PATHOLOGICAL_BATTERY_VERSION = 'p10-m1-pathological-model-battery-v1';
export const PATHOLOGICAL_MODEL_CASE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_value, index) => `BM-${String(index + 1).padStart(2, '0')}`),
);

export function runPathologicalModelBattery({ solverVersion = P10_XVAL_SOLVER_VERSION } = {}) {
  const runners = [
    runBm01NoSupport,
    runBm02DuplicateMember,
    runBm03ZeroLength,
    runBm04Mechanism,
    runBm05TrussRotations,
    runBm06MasslessModalDofs,
    runBm07ConditionWarning,
    runBm08UnitParity,
    runBm09DisconnectedComponents,
    runBm10PivotWarning,
  ];
  const rows = runners.map((runner, index) => {
    const caseId = PATHOLOGICAL_MODEL_CASE_IDS[index];
    try {
      const observation = runner();
      return buildBatteryRow(caseId, observation, solverVersion);
    } catch (error) {
      return buildBatteryRow(caseId, {
        expectedCode: expectedCodes()[caseId],
        actualCode: 'BM_EXECUTION_FAILED',
        locations: [],
        details: { message: error?.message || String(error) },
        hashInput: { caseId },
      }, solverVersion);
    }
  });
  const duplicateCaseIds = rows
    .map((row) => row.caseId)
    .filter((caseId, index, values) => values.indexOf(caseId) !== index);
  const missingCaseIds = PATHOLOGICAL_MODEL_CASE_IDS.filter((caseId) => !rows.some((row) => row.caseId === caseId));
  const report = {
    version: P10_PATHOLOGICAL_BATTERY_VERSION,
    status: rows.every((row) => row.status === 'PASS')
      && duplicateCaseIds.length === 0
      && missingCaseIds.length === 0
      ? 'OK'
      : 'NG',
    solverVersion,
    rows,
    summary: {
      total: rows.length,
      pass: rows.filter((row) => row.status === 'PASS').length,
      ng: rows.filter((row) => row.status !== 'PASS').length,
      duplicateCaseIds: [...new Set(duplicateCaseIds)],
      missingCaseIds,
    },
  };
  return { ...report, artifactHash: stableHash(report).slice(0, 24) };
}

function runBm01NoSupport() {
  const model = baseModel();
  model.nodes = [node('N1', 0, 0, 0), node('N2', 3, 0, 0)];
  model.members = [frame('M1', 'N1', 'N2')];
  const validation = validateModel(model);
  const issue = validation.errors.find((item) => item.code === 'NO_SUPPORT');
  return diagnosticObservation('NO_SUPPORT', issue?.code, [issueLocation(issue)], { validation }, model);
}

function runBm02DuplicateMember() {
  const model = baseModel();
  model.nodes = [node('N1', 0, 0, 0, 'fixed'), node('N2', 3, 0, 0)];
  model.members = [frame('M1', 'N1', 'N2'), frame('M2', 'N2', 'N1')];
  const validation = validateModel(model);
  const issue = validation.errors.find((item) => item.code === 'DUPLICATE_MEMBER');
  return diagnosticObservation(
    'DUPLICATE_MEMBER',
    issue?.code,
    (issue?.memberIds || []).map((memberId) => ({ entityType: 'member', memberId })),
    { issue },
    model,
  );
}

function runBm03ZeroLength() {
  const model = baseModel();
  model.nodes = [node('N1', 0, 0, 0, 'fixed'), node('N2', 0, 0, 0)];
  model.members = [frame('M1', 'N1', 'N2')];
  const validation = validateModel(model);
  const issue = validation.errors.find((item) => item.code === 'ZERO_LENGTH_MEMBER');
  return diagnosticObservation(
    'ZERO_LENGTH_MEMBER',
    issue?.code,
    [{ entityType: 'member', memberId: issue?.target || null }],
    { issue },
    model,
  );
}

function runBm04Mechanism() {
  const model = baseModel();
  model.nodes = [
    node('N1', 0, 0, 0, 'pin'),
    node('N2', 3, 0, 0),
    node('N3', 6, 0, 0, 'roller'),
  ];
  model.members = [
    { ...frame('M1', 'N1', 'N2'), releases: { i: 'pin', j: 'pin' } },
    { ...frame('M2', 'N2', 'N3'), releases: { i: 'pin', j: 'pin' } },
  ];
  model.loads = [nodalLoad('P1', 'N2', 10, '-z')];
  const analysis = analyzeModel(model);
  const issue = analysis.validation?.errors?.find((item) => item.code === 'MECHANISM_DOF');
  const failure = analysis.byCombo?.D_ONLY?.failedComponents?.find((item) => item.reason === 'MECHANISM_DOF');
  const location = failure?.location || issue?.location || null;
  return diagnosticObservation(
    'MECHANISM_DOF',
    failure?.reason || issue?.code,
    location ? [location] : [],
    {
      failure,
      issue,
      analysisOk: analysis.ok,
      validationHealth: {
        ok: analysis.validation?.ok,
        status: analysis.validation?.status,
        issueCount: analysis.validation?.issueCount,
        errorCodes: (analysis.validation?.errors || []).map((item) => item.code),
      },
    },
    model,
  );
}

function runBm05TrussRotations() {
  const model = baseModel();
  model.nodes = [node('N1', 0, 0, 0, 'fixed'), node('N2', 3, 0, 0)];
  model.members = [{ ...frame('T1', 'N1', 'N2'), type: 'truss' }];
  model.loads = [nodalLoad('P1', 'N2', 10, '+x')];
  const analysis = analyzeModel(model);
  const fixed = analysis.byCombo?.D_ONLY?.solver?.autoFixedDofs || [];
  const rotations = fixed.filter((label) => /^N2\.r[xyz]$/.test(label));
  const code = analysis.ok && rotations.length === 3 ? 'AUTO_STABILIZED_FREE_ROTATIONS' : null;
  return diagnosticObservation(
    'AUTO_STABILIZED_FREE_ROTATIONS',
    code,
    rotations.map((label) => dofLabelLocation(label)),
    { autoFixedDofs: fixed, analysisOk: analysis.ok },
    model,
  );
}

function runBm06MasslessModalDofs() {
  const model = baseModel();
  model.nodes = [
    node('N0', 0, 0, 0, 'fixed'),
    node('N1', 0, 0, 3),
    { ...node('N2', 0, 0, 6), mass: [2, 0, 0] },
  ];
  model.members = [frame('C1', 'N0', 'N1'), frame('C2', 'N1', 'N2')];
  model.analysisSettings = { ...model.analysisSettings, modalModeCount: 1 };
  const dynamics = analyzeDynamics(model);
  const condensed = dynamics.ok
    && dynamics.condensation?.status === 'available'
    && dynamics.condensation.residualDofCount > 0
    && dynamics.condensation.transformationPreserved === true;
  return diagnosticObservation(
    'MASSLESS_DOF_CONDENSED',
    condensed ? 'MASSLESS_DOF_CONDENSED' : dynamics.reason,
    [{ entityType: 'node', nodeId: 'N1', role: 'massless-residual-domain' }],
    { condensation: dynamics.condensation, modeCount: dynamics.modes?.length || 0 },
    model,
  );
}

function runBm07ConditionWarning() {
  const model = baseModel();
  model.nodes = [
    node('A', 0, 0, 0, 'fixed'),
    {
      ...node('B', 3, 0, 0, 'spring'),
      spring: { kx: 1, ky: 1e-6, kz: 1, krx: 1, kry: 1, krz: 1 },
    },
  ];
  model.members = [{ ...frame('T1', 'A', 'B'), type: 'truss' }];
  model.loads = [nodalLoad('P1', 'B', 1e-6, '+y')];
  const analysis = analyzeModel(model);
  const failure = analysis.byCombo?.D_ONLY?.failedComponents?.[0];
  const warning = failure?.solver?.warnings?.find((item) => item.code === 'SOLVER_CONDITION_WARN');
  return diagnosticObservation(
    'SOLVER_CONDITION_WARN',
    warning?.code,
    [{ entityType: 'solver', target: warning?.target || 'solver.conditionEstimate' }],
    {
      conditionEstimate: failure?.solver?.conditionEstimate,
      warning,
      solveOk: false,
      analysisOk: analysis.ok,
      failureReason: failure?.reason,
      fixtureLevel: 'assembled-product-model',
    },
    model,
  );
}

function runBm08UnitParity() {
  const metreKilonewton = { E: 200e6, A: 0.02, L: 3, P: 20, lengthUnit: 'm', forceUnit: 'kN' };
  const millimetreNewton = { E: 200000, A: 20000, L: 3000, P: 20000, lengthUnit: 'mm', forceUnit: 'N' };
  const solve = (system) => {
    const canonical = system.lengthUnit === 'mm'
      ? { E: system.E, A: system.A / 1e6, L: system.L / 1000, P: system.P / 1000 }
      : { E: system.E / 1000, A: system.A, L: system.L, P: system.P };
    const model = baseModel();
    model.materials[0] = { ...model.materials[0], E: canonical.E };
    model.sections[0] = { ...model.sections[0], A: canonical.A };
    model.nodes = [node('A', 0, 0, 0, 'fixed'), node('B', canonical.L, 0, 0)];
    model.members = [{ ...frame('T1', 'A', 'B'), type: 'truss' }];
    model.loads = [nodalLoad('P1', 'B', canonical.P, '+x')];
    model.unitSystem.conversionAudit = [{
      source: `${system.lengthUnit}-${system.forceUnit}`,
      target: 'm-kN',
      normalized: system.lengthUnit === 'mm',
    }];
    const analysis = analyzeModel(model);
    const displacement = analysis.byCombo?.D_ONLY?.disp?.B?.[0] ?? null;
    const reaction = analysis.byCombo?.D_ONLY?.reactions?.A?.rx ?? null;
    return {
      ok: analysis.ok,
      displacement,
      strain: displacement / canonical.L,
      reactionRatio: reaction / canonical.P,
      canonical,
      canonicalModelHash: modelHash(model),
    };
  };
  const metre = solve(metreKilonewton);
  const millimetre = solve(millimetreNewton);
  const strainDifference = relativeDifference(metre.strain, millimetre.strain);
  const reactionRatioDifference = relativeDifference(metre.reactionRatio, millimetre.reactionRatio);
  const parity = metre.ok && millimetre.ok
    && strainDifference < 1e-9
    && reactionRatioDifference < 1e-9;
  return diagnosticObservation(
    'UNIT_SYSTEM_PARITY',
    parity ? 'UNIT_SYSTEM_PARITY' : 'UNIT_SYSTEM_PARITY_FAILED',
    [
      { entityType: 'unit-model', unitSystem: 'm-kN' },
      { entityType: 'unit-model', unitSystem: 'mm-N' },
    ],
    {
      metreKilonewton: { input: metreKilonewton, result: metre },
      millimetreNewton: { input: millimetreNewton, result: millimetre },
      strainDifference,
      reactionRatioDifference,
      fixtureLevel: 'assembled-product-model-after-explicit-normalization',
      limitation: 'The mm-N source is explicitly normalized before product assembly because the product model schema requires m-kN internal units.',
    },
    { metreKilonewton, millimetreNewton },
  );
}

function runBm09DisconnectedComponents() {
  const model = baseModel();
  model.nodes = [
    node('A0', 0, 0, 0, 'fixed'), node('A1', 3, 0, 0),
    node('B0', 0, 5, 0, 'fixed'), node('B1', 4, 5, 0),
  ];
  model.members = [frame('MA', 'A0', 'A1'), frame('MB', 'B0', 'B1')];
  model.loads = [nodalLoad('PA', 'A1', 10, '+x'), nodalLoad('PB', 'B1', 12, '+x')];
  const analysis = analyzeModel(model);
  const combo = analysis.byCombo?.D_ONLY;
  const complete = analysis.ok
    && combo?.solver?.componentCount === 2
    && Number.isFinite(combo.disp?.A1?.[0])
    && Number.isFinite(combo.disp?.B1?.[0]);
  return diagnosticObservation(
    'DISCONNECTED_COMPONENTS_ANALYZED',
    complete ? 'DISCONNECTED_COMPONENTS_ANALYZED' : combo?.reason,
    [
      { entityType: 'component', memberIds: ['MA'], nodeIds: ['A0', 'A1'] },
      { entityType: 'component', memberIds: ['MB'], nodeIds: ['B0', 'B1'] },
    ],
    {
      componentCount: combo?.solver?.componentCount,
      displacements: { A1: combo?.disp?.A1?.[0], B1: combo?.disp?.B1?.[0] },
    },
    model,
  );
}

function runBm10PivotWarning() {
  const model = baseModel();
  model.nodes = [
    node('A', 0, 0, 0, 'fixed'),
    {
      ...node('B', 3, 0, 0, 'spring'),
      spring: { kx: 1, ky: 1e-3, kz: 1, krx: 1, kry: 1, krz: 1 },
    },
  ];
  model.members = [{ ...frame('T1', 'A', 'B'), type: 'truss' }];
  model.loads = [nodalLoad('P1', 'B', 1e-3, '+y')];
  const analysis = analyzeModel(model);
  const diagnostics = analysis.byCombo?.D_ONLY?.solver;
  const warning = diagnostics?.warnings?.find((item) => item.code === 'SOLVER_PIVOT_NEAR_SINGULAR');
  const locations = (warning?.dofs || diagnostics?.suspectedMechanismDofs || []).map(dofLabelLocation);
  return diagnosticObservation(
    'SOLVER_PIVOT_NEAR_SINGULAR',
    warning?.code,
    locations,
    {
      pivotRatio: diagnostics?.pivotRatio,
      suspectedMechanismDofs: diagnostics?.suspectedMechanismDofs,
      warning,
      solveOk: analysis.byCombo?.D_ONLY?.ok,
      analysisOk: analysis.ok,
      validationHealth: {
        ok: analysis.validation?.ok,
        status: analysis.validation?.status,
        issueCount: analysis.validation?.issueCount,
        warningCodes: (analysis.validation?.warnings || []).map((item) => item.code),
      },
      fixtureLevel: 'assembled-product-model',
    },
    model,
  );
}

function buildBatteryRow(caseId, observation, solverVersion) {
  const expectedCode = observation.expectedCode || expectedCodes()[caseId];
  const actualCode = observation.actualCode || null;
  const locations = (observation.locations || []).filter(Boolean);
  const matched = expectedCode === actualCode && locations.length > 0;
  const boundHash = modelHash(observation.hashInput || { caseId });
  return {
    version: P10_PATHOLOGICAL_BATTERY_VERSION,
    caseId,
    status: matched ? 'PASS' : 'NG',
    expectedCode,
    actualCode,
    locations,
    details: observation.details || {},
    record: {
      version: VERIFICATION_MATRIX_RECORD_VERSION,
      caseId,
      tier: 'BM',
      name: `${caseId} ${expectedCode}`,
      metric: 'diagnostic-code-and-location-match',
      units: '1',
      reference: 1,
      computed: matched ? 1 : 0,
      relError: matched ? 0 : 1,
      tolerance: 0,
      toleranceKey: null,
      modelHash: boundHash,
      solverVersion,
      referenceSource: 'phase10-pathological-model-contract',
      status: matched ? 'OK' : 'NG',
      details: { expectedCode, actualCode, locations },
    },
  };
}

function diagnosticObservation(expectedCode, actualCode, locations, details, hashInput) {
  return { expectedCode, actualCode, locations, details, hashInput };
}

function expectedCodes() {
  return {
    'BM-01': 'NO_SUPPORT',
    'BM-02': 'DUPLICATE_MEMBER',
    'BM-03': 'ZERO_LENGTH_MEMBER',
    'BM-04': 'MECHANISM_DOF',
    'BM-05': 'AUTO_STABILIZED_FREE_ROTATIONS',
    'BM-06': 'MASSLESS_DOF_CONDENSED',
    'BM-07': 'SOLVER_CONDITION_WARN',
    'BM-08': 'UNIT_SYSTEM_PARITY',
    'BM-09': 'DISCONNECTED_COMPONENTS_ANALYZED',
    'BM-10': 'SOLVER_PIVOT_NEAR_SINGULAR',
  };
}

function baseModel() {
  return createBenchmarkModel();
}

function node(id, x, y, z, support = null) {
  return { id, x, y, z, support };
}

function frame(id, n1, n2) {
  return {
    id,
    type: 'frame',
    n1,
    n2,
    matId: 'bench-steel',
    secId: 'bench-rect',
    releases: { i: 'rigid', j: 'rigid' },
  };
}

function nodalLoad(id, nodeId, magnitude, dir) {
  return { id, type: 'nodal', node: nodeId, P: magnitude, dir, case: 'D' };
}

function issueLocation(issue) {
  return issue ? { entityType: 'validation-target', target: issue.target } : null;
}

function dofLabelLocation(label) {
  const [nodeId, component] = String(label).split('.');
  return { entityType: 'dof', nodeId, component, label: String(label) };
}

function relativeDifference(left, right) {
  return Math.abs(Number(left) - Number(right)) / Math.max(Math.abs(Number(left)), Math.abs(Number(right)), 1e-12);
}
