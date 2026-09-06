import { stableHash } from '../../core/stableHash.js';
import { createHingeProperty } from '../properties/hingeRegistry.js';
import { normalizePhase8NumericalComparisons } from './comparisonContract.js';

export const PHASE8_PILOT_PACKAGE_VERSION = 'p8-m11-pilot-package-v1';
export const PHASE8_PILOT_ARTIFACT_VERSION = 'p8-m11-pilot-artifact-v1';

const PILOT_IDS = Object.freeze([
  'PILOT-ST-01',
  'PILOT-ST-02',
  'PILOT-ST-03',
  'PILOT-RC-01',
  'PILOT-DYN-01',
]);

const VERIFICATION_BY_PILOT = Object.freeze({
  'PILOT-ST-01': 'NL-PILOT-01',
  'PILOT-ST-02': 'NL-PILOT-02',
  'PILOT-ST-03': 'NL-PILOT-03',
  'PILOT-RC-01': 'NL-PILOT-04',
  'PILOT-DYN-01': 'NL-PILOT-05',
});

export function listPhase8PilotPackages() {
  return pilotDefinitions().map(finalizePilot);
}

export function getPhase8PilotPackage(id) {
  const pilot = listPhase8PilotPackages().find((row) => row.id === String(id || ''));
  return pilot ? clone(pilot) : null;
}

export function buildPhase8PilotArtifact(pilotInput, input = {}) {
  const pilot = resolvePilot(pilotInput);
  const execution = normalizeExecution(input.execution || input.result || {}, pilot);
  const report = normalizeReport(input.report || {}, execution);
  const externalComparison = normalizeExternalComparison(input.externalComparison);
  const ownerReview = normalizeOwnerReview(input.ownerReview);
  const reproducible = executionMatchesExpected(pilot, execution)
    && clean(report.reportHash)
    && clean(report.path);
  const qualificationStatus = reproducible
    && externalComparison.status === 'PASS'
    && ownerReview.status === 'APPROVED'
    ? 'verified'
    : reproducible ? 'candidate' : 'blocked';
  const core = {
    version: PHASE8_PILOT_ARTIFACT_VERSION,
    pilotId: pilot.id,
    verificationId: pilot.verificationId,
    packageVersion: pilot.version,
    packageHash: pilot.packageHash,
    inputHash: pilot.inputHash,
    generatedAt: clean(input.generatedAt) || null,
    sourceRevision: clean(input.sourceRevision) || null,
    execution,
    report,
    externalComparison,
    ownerReview,
    reproducibility: {
      status: reproducible ? 'PASS' : 'FAIL',
      command: `npm run qualify:p8:m11 -- --pilot=${pilot.id}`,
      requiredInputHash: pilot.inputHash,
      requiredPackageHash: pilot.packageHash,
    },
    qualification: {
      status: qualificationStatus,
      designBlocked: qualificationStatus !== 'verified',
      reason: qualificationStatus === 'verified'
        ? null
        : externalComparison.status !== 'PASS'
          ? 'INDEPENDENT_EXTERNAL_COMPARISON_REQUIRED'
          : ownerReview.status !== 'APPROVED'
            ? 'PILOT_OWNER_SIGNOFF_REQUIRED'
            : 'PILOT_REPRODUCIBILITY_FAILED',
    },
  };
  return deepFreeze({ ...core, artifactHash: pilotArtifactHash(core) });
}

export function validatePhase8PilotArtifact(artifact = {}, pilotInput = null) {
  const errors = [];
  if (artifact.version !== PHASE8_PILOT_ARTIFACT_VERSION) errors.push('artifact:version');
  const pilot = pilotInput ? resolvePilot(pilotInput) : getPhase8PilotPackage(artifact.pilotId);
  if (!pilot) return { ok: false, errors: [...errors, 'artifact:pilot'] };
  if (artifact.pilotId !== pilot.id) errors.push('artifact:pilot-id');
  if (artifact.verificationId !== pilot.verificationId) errors.push('artifact:verification-id');
  if (artifact.packageHash !== pilot.packageHash) errors.push('artifact:package-hash');
  if (artifact.inputHash !== pilot.inputHash) errors.push('artifact:input-hash');
  if (!clean(artifact.generatedAt)) errors.push('artifact:generated-at');
  if (!clean(artifact.sourceRevision)) errors.push('artifact:source-revision');
  if (!executionMatchesExpected(pilot, artifact.execution || {})) errors.push('artifact:execution');
  if (!clean(artifact.report?.reportHash) || !clean(artifact.report?.path)) errors.push('artifact:report');
  if (artifact.reproducibility?.status !== 'PASS') errors.push('artifact:reproducibility');
  if (!['candidate', 'verified'].includes(artifact.qualification?.status)) errors.push('artifact:qualification');
  if (artifact.qualification?.status === 'verified') {
    if (artifact.externalComparison?.status !== 'PASS') errors.push('artifact:external-comparison');
    if (artifact.ownerReview?.status !== 'APPROVED') errors.push('artifact:owner-review');
    if (artifact.qualification?.designBlocked !== false) errors.push('artifact:design-block');
  } else if (artifact.qualification?.designBlocked !== true) errors.push('artifact:design-block');
  const expectedHash = pilotArtifactHash({ ...artifact, artifactHash: undefined });
  if (artifact.artifactHash !== expectedHash) errors.push('artifact:integrity-hash');
  return { ok: errors.length === 0, errors };
}

export function summarizePhase8PilotArtifacts(artifacts = []) {
  const byId = new Map((artifacts || []).map((artifact) => [artifact?.pilotId, artifact]));
  const results = listPhase8PilotPackages().map((pilot) => {
    const artifact = byId.get(pilot.id);
    const validation = artifact ? validatePhase8PilotArtifact(artifact, pilot) : { ok: false, errors: ['artifact:missing'] };
    return deepFreeze({
      id: pilot.verificationId,
      pilotId: pilot.id,
      status: validation.ok ? 'PASS' : 'FAIL',
      qualification: artifact?.qualification?.status || 'missing',
      designBlocked: artifact?.qualification?.designBlocked !== false,
      artifactHash: artifact?.artifactHash || null,
      errors: validation.errors,
    });
  });
  const complete = results.every((row) => row.status === 'PASS');
  const independentlyQualified = complete && results.every((row) => row.qualification === 'verified');
  const core = {
    version: PHASE8_PILOT_ARTIFACT_VERSION,
    status: complete ? 'PASS' : 'FAIL',
    independentlyQualified,
    releaseReady: independentlyQualified,
    pilotCount: PILOT_IDS.length,
    verifiedPilotCount: results.filter((row) => row.qualification === 'verified').length,
    results,
    blockers: independentlyQualified ? [] : [
      'INDEPENDENT_EXTERNAL_COMPARISON_REQUIRED',
      'PILOT_OWNER_SIGNOFF_REQUIRED',
    ],
  };
  return deepFreeze({ ...core, summaryHash: stableHash(core).slice(0, 24) });
}

function pilotDefinitions() {
  return [
    {
      id: 'PILOT-ST-01',
      title: '2D steel portal frame',
      materialSystem: 'steel',
      model: steelPortalModel(),
      analysisCases: [pushoverCase('PILOT-ST-01-PUSH', 'T2', '+x', 0.001, { arcLength: { enabled: true, steps: 3 } })],
      workflow: ['gravity-preload', 'hinge-calibration', 'displacement-pushover', 'arc-length-continuation', 'capacity-and-hinge-report'],
      expected: { executionStatus: 'completed', acceptedTermination: ['TARGET_REACHED', 'MECHANISM_DETECTED', 'ARC_LENGTH_STEPS_COMPLETED'] },
      requiredResultFields: ['resultHash', 'runRecordId', 'capacityCurve', 'hingeEvents', 'checkpointHash'],
      comparison: { required: true, minimumLevel: 'L5', channels: ['controlDisplacement', 'baseShear', 'hingeState'] },
    },
    {
      id: 'PILOT-ST-02',
      title: '3D steel moment frame',
      materialSystem: 'steel',
      model: steelMomentFrame3dModel(),
      analysisCases: [
        pushoverCase('PILOT-ST-02-PUSH-X', 'N223', '+x', 0.02),
        pushoverCase('PILOT-ST-02-PUSH-Y', 'N223', '+y', 0.02),
      ],
      workflow: ['gravity-preload', 'rigid-diaphragm', 'bidirectional-pushover', 'story-member-origin-recovery', 'calculation-report'],
      expected: { executionStatus: 'completed', acceptedTermination: ['TARGET_REACHED', 'MECHANISM_DETECTED'] },
      requiredResultFields: ['resultHash', 'runRecordId', 'storyResponse', 'memberResults', 'domainIdentityHash'],
      comparison: { required: true, minimumLevel: 'L5', channels: ['roofDisplacement', 'baseShear', 'storyDrift', 'memberEndForce'] },
    },
    {
      id: 'PILOT-ST-03',
      title: 'Steel braced frame unsupported-scope gate',
      materialSystem: 'steel',
      model: steelBracedFrameModel(),
      analysisCases: [pushoverCase('PILOT-ST-03-PUSH', 'T2', '+x', 0.02)],
      workflow: ['gravity-preload', 'unilateral-brace-detection', 'fail-closed-preflight', 'blocked-report'],
      expected: { executionStatus: 'blocked', reason: 'NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED' },
      requiredResultFields: ['reason', 'designBlocked', 'capabilityHash'],
      comparison: { required: false, minimumLevel: 'L4', channels: ['blockingCode'] },
    },
    {
      id: 'PILOT-RC-01',
      title: 'RC moment frame with fiber-generated PMM hinges',
      materialSystem: 'reinforced-concrete',
      model: rcMomentFrameModel(),
      analysisCases: [pushoverCase('PILOT-RC-01-PUSH', 'RT2', '+x', 0.005, { steps: 4 })],
      workflow: ['gravity-preload', 'reinforcement-snapshot', 'fiber-pmm-preprocess', 'displacement-pushover', 'story-drift-report'],
      expected: { executionStatus: 'completed', acceptedTermination: ['TARGET_REACHED', 'MECHANISM_DETECTED', 'POST_PEAK_THRESHOLD'] },
      requiredResultFields: ['resultHash', 'runRecordId', 'fiberPmmHash', 'storyResponse', 'memberResults'],
      comparison: { required: true, minimumLevel: 'L5', channels: ['baseShear', 'roofDisplacement', 'storyDrift', 'sectionState'] },
    },
    {
      id: 'PILOT-DYN-01',
      title: 'Gravity-preloaded 3D frame MDOF NLTH',
      materialSystem: 'steel',
      model: dynamicFrameModel(),
      analysisCases: [nlthCase()],
      workflow: ['gravity-preload', 'mass-and-damping', 'ground-motion-input', 'mdof-newmark', 'history-energy-peak-report'],
      expected: { executionStatus: 'completed', acceptedTermination: ['DYNAMIC_TIME_RANGE_COMPLETED'] },
      requiredResultFields: ['resultHash', 'runRecordId', 'historyManifestHash', 'energyAudit', 'checkpointHash'],
      comparison: { required: true, minimumLevel: 'L5', channels: ['nodeDisplacement', 'baseReaction', 'energy', 'peakTime'] },
    },
  ];
}

function finalizePilot(input) {
  const core = {
    version: PHASE8_PILOT_PACKAGE_VERSION,
    id: input.id,
    verificationId: VERIFICATION_BY_PILOT[input.id],
    title: input.title,
    materialSystem: input.materialSystem,
    model: clone(input.model),
    analysisCases: clone(input.analysisCases),
    workflow: [...input.workflow],
    expected: clone(input.expected),
    requiredResultFields: [...input.requiredResultFields],
    comparison: clone(input.comparison),
    reproducibility: {
      runner: 'tools/run-p8-m11-qualification.mjs',
      fallbackPolicy: 'forbidden',
      reportRequired: true,
      rawResultRequired: true,
    },
  };
  const inputHash = stableHash({ model: core.model, analysisCases: core.analysisCases }).slice(0, 24);
  return deepFreeze({ ...core, inputHash, packageHash: stableHash({ ...core, inputHash }).slice(0, 24) });
}

function steelPortalModel() {
  const hinge = steelHingeProperty('HP-ST-PORTAL', 85);
  return baseModel({
    nodes: [
      { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B2', x: 5, y: 0, z: 0, support: 'fixed' },
      { id: 'T1', x: 0, y: 0, z: 3.5 },
      { id: 'T2', x: 5, y: 0, z: 3.5 },
    ],
    members: [
      frame('C1', 'B1', 'T1', 'COL', { hinges: twoEndHinges('C1', hinge.id) }),
      frame('C2', 'B2', 'T2', 'COL', { hinges: twoEndHinges('C2', hinge.id) }),
      frame('G1', 'T1', 'T2', 'BEAM'),
    ],
    loads: gravityLoads(['T1', 'T2'], 12),
    hingeProperties: [hinge],
  });
}

function steelMomentFrame3dModel() {
  const nodes = [];
  const members = [];
  const loads = [];
  const xs = [0, 6];
  const ys = [0, 5];
  const zs = [0, 3.3, 6.6];
  const nodeId = (ix, iy, iz) => `N${ix + 1}${iy + 1}${iz + 1}`;
  for (let iz = 0; iz < zs.length; iz += 1) {
    for (let iy = 0; iy < ys.length; iy += 1) {
      for (let ix = 0; ix < xs.length; ix += 1) {
        nodes.push({ id: nodeId(ix, iy, iz), x: xs[ix], y: ys[iy], z: zs[iz], ...(iz === 0 ? { support: 'fixed' } : {}) });
        if (iz > 0) loads.push({ id: `G-${ix}-${iy}-${iz}`, type: 'nodal', node: nodeId(ix, iy, iz), P: 8, direction: [0, 0, -1], case: 'D' });
      }
    }
  }
  for (let iz = 0; iz < 2; iz += 1) {
    for (let iy = 0; iy < 2; iy += 1) {
      for (let ix = 0; ix < 2; ix += 1) members.push(frame(`C-${ix}-${iy}-${iz}`, nodeId(ix, iy, iz), nodeId(ix, iy, iz + 1), 'COL'));
    }
  }
  for (let iz = 1; iz < 3; iz += 1) {
    for (let iy = 0; iy < 2; iy += 1) members.push(frame(`BX-${iy}-${iz}`, nodeId(0, iy, iz), nodeId(1, iy, iz), 'BEAM'));
    for (let ix = 0; ix < 2; ix += 1) members.push(frame(`BY-${ix}-${iz}`, nodeId(ix, 0, iz), nodeId(ix, 1, iz), 'BEAM'));
  }
  const model = baseModel({ nodes, members, loads });
  model.diaphragms = [1, 2].map((iz) => ({
    id: `DIA-${iz}`,
    type: 'rigid',
    nodeIds: [nodeId(0, 0, iz), nodeId(1, 0, iz), nodeId(0, 1, iz), nodeId(1, 1, iz)],
  }));
  return model;
}

function steelBracedFrameModel() {
  const model = steelPortalModel();
  model.members.push({
    id: 'BR1',
    type: 'truss',
    behavior: 'tensionOnly',
    n1: 'B1',
    n2: 'T2',
    matId: 'MAT-ST',
    secId: 'BRACE',
  });
  return model;
}

function rcMomentFrameModel() {
  const reinforcement = rcReinforcementSnapshot();
  const hinge = steelHingeProperty('HP-RC-PILOT', 180);
  const concentrated = (id, n1, n2, sectionId) => ({
    id,
    type: 'frame',
    behavior: 'frame',
    n1,
    n2,
    matId: 'RC30',
    secId: sectionId,
    localAxis: { refVector: id.startsWith('RB') ? [0, 0, 1] : [1, 0, 0], roll: 0, strongAxis: 'z' },
    nonlinear: { formulation: 'concentrated-plasticity', hinges: twoEndHinges(id, hinge.id), reinforcementSnapshot: reinforcement },
  });
  const model = baseModel({
    nodes: [
      { id: 'RB1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'RB2', x: 5, y: 0, z: 0, support: 'fixed' },
      { id: 'RT1', x: 0, y: 0, z: 3.2 },
      { id: 'RT2', x: 5, y: 0, z: 3.2 },
    ],
    members: [
      concentrated('RC1', 'RB1', 'RT1', 'RC-COL'),
      concentrated('RC2', 'RB2', 'RT2', 'RC-COL'),
      concentrated('RBM', 'RT1', 'RT2', 'RC-BEAM'),
    ],
    loads: gravityLoads(['RT1', 'RT2'], 80),
    materials: [{ id: 'RC30', version: 1, kind: 'concrete', E: 30000, G: 12500, fck: 30, density: 0 }],
    sections: [
      { id: 'RC-COL', version: 1, kind: 'parametric', shape: 'RECT', params: { B: 500, H: 500 }, properties: { A: 0.25, Iy: 0.0052083333, Iz: 0.0052083333, J: 0.0088 } },
      { id: 'RC-BEAM', version: 1, kind: 'parametric', shape: 'RECT', params: { B: 400, H: 600 }, properties: { A: 0.24, Iy: 0.0032, Iz: 0.0072, J: 0.006 } },
    ],
    hingeProperties: [hinge],
  });
  model.reinforcementSnapshots = Object.fromEntries(model.members.map((member) => [member.id, reinforcement]));
  return model;
}

function dynamicFrameModel() {
  const hinge = steelHingeProperty('HP-DYN-COL', 55);
  const model = baseModel({
    nodes: [
      { id: 'DB', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'DT', x: 0, y: 0, z: 3, mass: [1, 1, 1, 0, 0, 0] },
    ],
    members: [frame('DC', 'DB', 'DT', 'COL', { hinges: [{ id: 'DC:i:z', memberId: 'DC', end: 'i', axis: 'z', propertyId: hinge.id, source: { mode: 'user' } }] })],
    loads: gravityLoads(['DT'], 5),
    hingeProperties: [hinge],
  });
  model.massSources = [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, components: [{ caseId: 'D', factor: 1 }], combos: [] }];
  return model;
}

function baseModel(input = {}) {
  return {
    schemaVersion: 5,
    nodes: clone(input.nodes || []),
    members: clone(input.members || []),
    materials: clone(input.materials || [{ id: 'MAT-ST', version: 1, kind: 'steel', E: 2e8, G: 7.7e7, Fy: 275000, density: 0 }]),
    sections: clone(input.sections || [
      { id: 'COL', version: 1, shape: 'H', A: 0.035, Iy: 2.8e-4, Iz: 5.2e-4, J: 6e-5, Zy: 0.0024, Zz: 0.0034 },
      { id: 'BEAM', version: 1, shape: 'H', A: 0.028, Iy: 2e-4, Iz: 4.5e-4, J: 5e-5, Zy: 0.002, Zz: 0.003 },
      { id: 'BRACE', version: 1, shape: 'PIPE', A: 0.009, Iy: 4e-5, Iz: 4e-5, J: 8e-5 },
    ]),
    loads: clone(input.loads || []),
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'GRAV', name: 'Gravity preload', type: 'service', purpose: 'gravity-preload', factors: { D: 1 } }],
    massSources: clone(input.massSources || []),
    diaphragms: clone(input.diaphragms || []),
    hingeProperties: clone(input.hingeProperties || []),
    nonlinearMaterials: [],
    nonlinearSections: [],
    linkProperties: [],
    timeHistoryFunctions: [],
    analysisStates: [],
    analysisCases: [],
    analysisSettings: { includeSelfWeight: false },
  };
}

function frame(id, n1, n2, secId, options = {}) {
  return {
    id,
    type: 'frame',
    behavior: 'frame',
    n1,
    n2,
    matId: 'MAT-ST',
    secId,
    localAxis: { refVector: id.startsWith('G') || id.startsWith('B') ? [0, 0, 1] : [1, 0, 0], roll: 0, strongAxis: 'z' },
    ...(options.hinges ? { nonlinear: { formulation: 'concentrated-plasticity', hinges: options.hinges } } : {}),
  };
}

function pushoverCase(id, controlNodeId, direction, targetDisplacement, settings = {}) {
  return {
    id,
    kind: 'pushover',
    engineId: 'p8-production-mdof-pushover',
    inputRefs: { gravityCombinationId: 'GRAV' },
    initialState: { policy: 'zero' },
    control: { type: settings.arcLength?.enabled ? 'arcLength' : 'displacement', nodeId: controlNodeId, direction, targetDisplacement },
    settings: {
      gravityCombinationId: 'GRAV',
      controlNodeId,
      direction,
      targetDisplacement,
      pattern: 'triangular',
      referenceBaseShear: 20,
      steps: 8,
      ...settings,
    },
    solver: { execution: 'worker-wasm-sparse', maxIterations: 30 },
  };
}

function nlthCase() {
  return {
    id: 'PILOT-DYN-01-NLTH',
    kind: 'nonlinearTimeHistory',
    engineId: 'p8-production-mdof-nlth',
    inputRefs: { gravityCombinationId: 'GRAV', massSourceId: 'MS' },
    initialState: { policy: 'zero' },
    settings: {
      gravityCombinationId: 'GRAV',
      massSourceId: 'MS',
      groundMotionRecords: [{ id: 'GM-X', values: [0, 0.5, -0.35, 0.2, 0], dt: 0.02, unit: 'm/s2', direction: 'x', baseline: 'none' }],
      damping: { type: 'rayleigh', coefficients: { alpha: 0.05, beta: 0.0001 }, stiffnessPolicy: 'initial' },
      newmark: { outputDt: 0.02, initialDt: 0.02, minDt: 0.0003125, checkpointInterval: 2, maxIterations: 40 },
      output: { history: { chunkSize: 2, retainChunks: true, memoryBudgetBytes: 2 * 1024 * 1024 } },
      fiberPmm: false,
    },
    solver: { execution: 'worker-wasm-sparse', maxIterations: 40 },
  };
}

function steelHingeProperty(id, yieldMoment) {
  const side = [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.001, moment: yieldMoment },
    { id: 'C', rotation: 0.015, moment: yieldMoment * 1.1 },
    { id: 'D', rotation: 0.04, moment: yieldMoment * 0.2 },
    { id: 'E', rotation: 0.08, moment: yieldMoment * 0.2 },
  ];
  return createHingeProperty({
    id,
    qualification: 'candidate',
    units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
    parameters: {
      positive: side,
      negative: side,
      hingeLength: 0.2,
      hysteresis: { rule: 'kinematic-masing' },
      regularization: { tangentPolicy: 'diagnostic-only' },
      integration: { maxRotationIncrement: 0.0001, maxSubsteps: 4096 },
    },
    source: { type: 'closed-form-test', reference: `Phase 8 M11 ${id} fixture` },
  });
}

function twoEndHinges(memberId, propertyId) {
  return ['i', 'j'].map((end) => ({ id: `${memberId}:${end}:z`, memberId, end, axis: 'z', propertyId, source: { mode: 'user' } }));
}

function gravityLoads(nodeIds, force) {
  return nodeIds.map((nodeId, index) => ({ id: `G-${index + 1}`, type: 'nodal', node: nodeId, P: force, direction: [0, 0, -1], case: 'D' }));
}

function rcReinforcementSnapshot() {
  return {
    id: 'RC-PILOT-BARS',
    version: 1,
    qualification: 'candidate',
    units: { length: 'mm', area: 'mm2' },
    cover: 40,
    bars: [
      { id: 'B1', y: -140, z: -140, area: 491 },
      { id: 'B2', y: 140, z: -140, area: 491 },
      { id: 'B3', y: -140, z: 140, area: 491 },
      { id: 'B4', y: 140, z: 140, area: 491 },
    ],
    material: { E: 200000, Fy: 400 },
    confinement: { enabled: false },
  };
}

function normalizeExecution(input, pilot) {
  const status = clean(input.status) || 'not-run';
  return deepFreeze({
    status,
    engineId: clean(input.engineId || input.engine?.id) || null,
    terminationReason: clean(input.terminationReason || input.termination?.reason || input.reason) || null,
    resultHash: clean(input.resultHash) || null,
    runRecordId: clean(input.runRecordId || input.runRecord?.id) || null,
    checkpointHash: clean(input.checkpointHash || input.checkpoint?.integrityHash) || null,
    fallbackUsed: input.fallbackUsed === true || input.routing?.fallbackUsed === true,
    designBlocked: input.designBlocked !== false,
    resultChannels: clone(input.resultChannels || null),
    summary: clone(input.summary || null),
    outputManifest: clone(input.outputManifest || null),
    requiredResultFields: pilot.requiredResultFields,
  });
}

function normalizeReport(input, execution) {
  return deepFreeze({
    path: clean(input.path) || null,
    reportHash: clean(input.reportHash) || null,
    resultHash: clean(input.resultHash) || execution.resultHash,
    format: clean(input.format) || 'json+markdown',
  });
}

function normalizeExternalComparison(input = {}) {
  const sourceHash = clean(input.sourceHash);
  const channels = Array.isArray(input.channels) ? input.channels.map(String).sort() : [];
  const comparisonAudit = normalizePhase8NumericalComparisons(input, channels);
  const pass = input.status === 'PASS'
    && clean(input.solver)
    && clean(input.solverVersion)
    && sourceHash
    && channels.length > 0
    && input.conventionAudit?.ok === true
    && comparisonAudit.ok === true;
  return deepFreeze({
    status: pass ? 'PASS' : 'MISSING',
    solver: clean(input.solver) || null,
    solverVersion: clean(input.solverVersion) || null,
    sourceHash: sourceHash || null,
    channels,
    tolerance: clone(input.tolerance || null),
    comparisons: clone(comparisonAudit.rows),
    comparisonAudit: {
      ok: comparisonAudit.ok,
      unexpectedChannels: comparisonAudit.unexpectedChannels,
      duplicateChannels: comparisonAudit.duplicateChannels,
      comparisonAuditHash: comparisonAudit.comparisonAuditHash,
    },
    conventionAudit: clone(input.conventionAudit || null),
  });
}

function normalizeOwnerReview(input = {}) {
  const approved = input.status === 'APPROVED' && clean(input.reviewerId) && clean(input.reviewedAt);
  return deepFreeze({
    status: approved ? 'APPROVED' : 'PENDING',
    reviewerId: clean(input.reviewerId) || null,
    reviewedAt: clean(input.reviewedAt) || null,
    note: clean(input.note) || null,
  });
}

function executionMatchesExpected(pilot, execution) {
  if (execution.fallbackUsed === true) return false;
  if (execution.status !== pilot.expected.executionStatus) return false;
  const requiredChannelsPresent = pilot.requiredResultFields.every(
    (field) => execution.resultChannels?.[field] === true,
  );
  if (!requiredChannelsPresent) return false;
  if (execution.status === 'blocked') {
    return execution.terminationReason === pilot.expected.reason && execution.designBlocked === true;
  }
  return clean(execution.resultHash)
    && clean(execution.runRecordId)
    && pilot.expected.acceptedTermination.includes(execution.terminationReason);
}

function pilotArtifactHash(artifact) {
  const copy = clone(artifact);
  delete copy.artifactHash;
  return stableHash(copy).slice(0, 24);
}

function resolvePilot(input) {
  if (typeof input === 'string') {
    const found = getPhase8PilotPackage(input);
    if (!found) throw pilotError('PILOT_PACKAGE_NOT_FOUND', `Unknown Phase 8 pilot ${input}.`);
    return found;
  }
  if (input?.version !== PHASE8_PILOT_PACKAGE_VERSION || !PILOT_IDS.includes(input.id)) {
    throw pilotError('PILOT_PACKAGE_INVALID', 'A valid Phase 8 pilot package is required.');
  }
  const expected = getPhase8PilotPackage(input.id);
  if (input.packageHash !== expected.packageHash) throw pilotError('PILOT_PACKAGE_INTEGRITY_FAILED', `Pilot ${input.id} package hash is invalid.`);
  return input;
}

function pilotError(code, message) {
  const error = new Error(message);
  error.name = 'Phase8PilotPackageError';
  error.code = code;
  return error;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
