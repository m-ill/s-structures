import { stableHash } from '../../../src/core/stableHash.js';
import { createModel, analyzeModel } from '../../../src/index.js';
import { runRealShellStabilizationQualification } from '../../../src/solver/shell/realStabilizationQualification.js';
import { runSp1 } from './strix21Completion.js';

export const ADDITIONAL_COMPARISON_VERSION = 'p18a-public-comparison-v1';

const XV1_PUBLIC = Object.freeze({
  lengthM: 3,
  heightM: 8.55,
  thicknessM: 0.2,
  storyCount: 3,
  elasticModulusMpa: 27515,
  poisson: 0.167,
  topLoadKn: 100,
  referenceMm: 1.8277,
  strixByMeshMm: Object.freeze({ 1: 1.7564, 2: 1.7872, 4: 1.8145, 8: 1.8244, 16: 1.8278 }),
  programAByMeshMm: Object.freeze({ 1: 1.756792, 16: 1.825787 }),
});

export async function runAdditionalPublicComparisons(options = {}) {
  const sp1 = await runSp1EquivalentCriterion();
  const p3s2 = runP3s2PrintedMembraneCriterion();
  const xv1 = runXv1CantileverWall(options.xv1MeshMultipliers || [1, 2, 4, 8, 16]);
  const core = {
    version: ADDITIONAL_COMPARISON_VERSION,
    generatedAt: options.generatedAt || '2026-08-29',
    scope: {
      official21: ['SP1', 'P3S2'],
      supplementalCrossCode: ['XV1', 'XV2'],
      externalOfficialPassClaimed: false,
    },
    SP1: sp1,
    P3S2: p3s2,
    XV1: xv1,
    XV2: {
      status: 'INPUT_BLOCKED',
      executed: false,
      reason: 'SHARED_MGT_AND_EXACT_RECOVERY_MAPPING_NOT_AVAILABLE',
      missing: [
        'DCR_wall_benchmark.mgt shared input file',
        'exact wall/transfer-beam connectivity and load application mapping',
        'beam shear recovery station and sign convention source lock',
      ],
      note: 'XV2 remains outside the official 21-case denominator and is not inferred from the PDF table alone.',
    },
  };
  return Object.freeze({ ...core, evidenceHash: stableHash(core) });
}

export async function runSp1EquivalentCriterion() {
  const engine = await runSp1();
  const probe = engine.probes.find((row) => row.id === 'SP1-PREPEAK-SELF-CONSISTENCY');
  const actualAbsPct = Math.abs(Number(probe?.actual));
  const limitPct = Number(probe?.tolerance?.value ?? 1);
  const core = {
    status: engine.status === 'PASS' && actualAbsPct <= limitPct ? 'PASS' : 'REVIEW',
    executed: true,
    comparisonKind: 'EQUIVALENT_PUBLIC_GATE',
    quantity: 'maximum absolute pre-peak self-consistency error',
    unit: '%',
    strix: 0.00076916,
    referenceLimit: limitPct,
    sStructures: actualAbsPct,
    limitUtilizationPct: 100 * actualAbsPct / limitPct,
    point2DirectResultClaimed: false,
    reason: 'The public SP1 gate is self-consistency at adaptive pre-peak steps; the exact Point 2 displacement is not reused as a displacement-control output.',
    productionEvidenceHash: engine.engineeringHash,
  };
  return Object.freeze({ ...core, comparisonHash: stableHash(core) });
}

export function runP3s2PrintedMembraneCriterion() {
  const qualification = runRealShellStabilizationQualification({
    alphas: [1e-6, 1e-5, 1e-4],
    floorRatios: [1e-12, 1e-9, 1e-6],
    meshMultipliers: [1, 2, 4],
    modeCount: 3,
    fixture: {
      storyCount: 3,
      baseHorizontalDivisions: 3,
      baseVerticalDivisionsPerStory: 2,
      width: 3,
      storyHeight: 3,
      thickness: 0.2,
      E: 30e9,
      G: 12.5e9,
      nu: 0.2,
      density: 2400,
    },
  });
  const baseline = qualification.sweep.rows.find((row) => row.pointId === qualification.sweep.baselinePointId);
  const actualPct = 100 * qualification.sensitivity.maximumPeriodShift;
  const limitPct = 0.5;
  const core = {
    status: qualification.status === 'pass' && actualPct <= limitPct ? 'PASS' : 'REVIEW',
    executed: true,
    comparisonKind: 'EQUIVALENT_PUBLIC_GATE_MEMBRANE_ONLY',
    quantity: 'maximum dominant membrane-mode period shift',
    unit: '%',
    strix: 0.19,
    referenceLimit: limitPct,
    sStructures: actualPct,
    limitUtilizationPct: 100 * actualPct / limitPct,
    baselineMode1Sec: baseline?.modal?.modes?.[0]?.period ?? null,
    publicBaselineMode1Sec: 0.050529,
    baselineDifferencePct: signedErrorPct(baseline?.modal?.modes?.[0]?.period, 0.050529),
    meshMode1Sec: qualification.meshConvergence.rows.map((row) => ({
      multiplier: row.meshMultiplier,
      period: row.periods[0],
    })),
    publicModel: {
      widthM: 3,
      heightM: 9,
      thicknessM: 0.2,
      mesh: '3 columns x 6 rows at 1x',
      material: 'E=30 GPa, nu=0.2, density=2400 kg/m3',
    },
    limitation: 'S-Structures executed the printed membrane geometry and its own dimensionless stabilizer contract. STRIX plate-mode rows and literal rotFloor/drillingStab parameter units are not claimed equivalent.',
    qualificationHash: qualification.qualificationHash,
  };
  return Object.freeze({ ...core, comparisonHash: stableHash(core) });
}

export function runXv1CantileverWall(meshMultipliers = [1, 2, 4, 8, 16]) {
  const rows = meshMultipliers.map(runXv1Mesh);
  const finest = rows.at(-1);
  const practice = rows.find((row) => row.multiplier === 1) || rows[0];
  const finestReferencePass = finest.multiplier === 16 && Math.abs(finest.errorVsReferencePct) <= 3;
  const practiceCrossCodePass = practice.programAMm != null && Math.abs(practice.errorVsProgramAPct) <= 3;
  const core = {
    status: rows.every((row) => row.ok) && (finestReferencePass || practiceCrossCodePass) ? 'PASS' : 'REVIEW',
    executed: true,
    comparisonKind: 'SUPPLEMENTAL_CROSS_CODE',
    publicInput: XV1_PUBLIC,
    rows,
    practice,
    finest,
    acceptance: { quantity: 'finest-mesh tip displacement', tolerancePct: 3 },
    note: 'XV1 is supplemental and does not increase the official STRIX 21-case denominator.',
  };
  return Object.freeze({ ...core, comparisonHash: stableHash(core) });
}

function runXv1Mesh(multiplier) {
  const nx = positiveInteger(multiplier);
  const ny = XV1_PUBLIC.storyCount * nx;
  const nodes = [];
  for (let iz = 0; iz <= ny; iz += 1) for (let ix = 0; ix <= nx; ix += 1) {
    nodes.push({
      id: `N-${ix}-${iz}`,
      x: XV1_PUBLIC.lengthM * ix / nx,
      y: 0,
      z: XV1_PUBLIC.heightM * iz / ny,
      ...(iz === 0 ? { support: 'fixed' } : {}),
    });
  }
  const shells = [];
  for (let iz = 0; iz < ny; iz += 1) for (let ix = 0; ix < nx; ix += 1) {
    shells.push({
      id: `S-${ix}-${iz}`,
      nodeIds: [`N-${ix}-${iz}`, `N-${ix + 1}-${iz}`, `N-${ix + 1}-${iz + 1}`, `N-${ix}-${iz + 1}`],
      formulation: 'membrane',
      matId: 'XV1-MAT',
      thickness: XV1_PUBLIC.thicknessM,
    });
  }
  const topNodes = nodes.filter((node) => Math.abs(node.z - XV1_PUBLIC.heightM) <= 1e-12);
  const loads = topNodes.map((node, index) => ({
    id: `P-${index + 1}`,
    type: 'nodal',
    node: node.id,
    P: XV1_PUBLIC.topLoadKn / topNodes.length,
    dir: '+x',
    case: 'D',
  }));
  const model = createModel({
    nodes,
    members: [],
    shells,
    materials: [{
      id: 'XV1-MAT', version: 1, name: 'XV1 elastic plane stress',
      E: XV1_PUBLIC.elasticModulusMpa,
      G: XV1_PUBLIC.elasticModulusMpa / (2 * (1 + XV1_PUBLIC.poisson)),
      nu: XV1_PUBLIC.poisson, density: 0, Fy: 1e20, Fu: 1e20,
    }],
    loads,
    loadCases: [{ id: 'D', name: 'XV1 top load', type: 'dead' }],
    loadCombinations: [{ id: 'C', name: '1.0D', type: 'service', factors: { D: 1 } }],
    analysisSettings: { includeSelfWeight: false },
  });
  const result = analyzeModel(model);
  const solved = result.byCombo?.C;
  if (!result.ok || !solved?.ok) {
    return Object.freeze({ multiplier: nx, ok: false, reason: solved?.reason || result.reason || 'XV1_SOLVE_FAILED' });
  }
  const displacementMm = 1000 * topNodes.reduce((sum, node) => sum + solved.disp[node.id][0], 0) / topNodes.length;
  const strix = XV1_PUBLIC.strixByMeshMm[nx] ?? null;
  const programA = XV1_PUBLIC.programAByMeshMm[nx] ?? null;
  return Object.freeze({
    multiplier: nx,
    ok: true,
    nodeCount: nodes.length,
    shellCount: shells.length,
    displacementMm,
    referenceMm: XV1_PUBLIC.referenceMm,
    strixMm: strix,
    programAMm: programA,
    errorVsReferencePct: signedErrorPct(displacementMm, XV1_PUBLIC.referenceMm),
    errorVsStrixPct: strix == null ? null : signedErrorPct(displacementMm, strix),
    errorVsProgramAPct: programA == null ? null : signedErrorPct(displacementMm, programA),
    equilibriumResidual: solved.summary?.equilibriumResidual ?? null,
  });
}

function signedErrorPct(actual, reference) {
  const a = Number(actual);
  const r = Number(reference);
  return Number.isFinite(a) && Number.isFinite(r) && r !== 0 ? 100 * (a - r) / Math.abs(r) : null;
}

function positiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`A positive integer mesh multiplier is required: ${value}`);
  return number;
}
