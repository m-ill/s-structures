import { createBenchmarkModel, BENCH_INTERNAL } from '../../examples/verification.js';
import { analyzeModel } from '../../solver/linear3d.js';
import { analyzeDynamics } from '../../dynamics/modal.js';
import { estimateGlobalBucklingTrace } from '../../dynamics/globalBuckling.js';

export const P10_XVAL_CASES_VERSION = 'p10-m1-xval-cases-v1';
export const XVAL_CASE_IDS = Object.freeze([
  'XV-01',
  'XV-02',
  'XV-03',
  'XV-04',
  'XV-05',
  'XV-06',
  'XV-07',
  'XV-08',
]);
export const XVAL_RELEASE_CASE_IDS = Object.freeze(
  Array.from({ length: 10 }, (_value, index) => `XV-${String(index + 1).padStart(2, '0')}`),
);
export const XVAL_M1_REQUIRED_CASE_IDS = Object.freeze(['XV-01', 'XV-02']);

export function createXvalCaseDefinitions() {
  return XVAL_CASE_IDS.map((caseId) => ({
    caseId,
    model: createXvalModel(caseId),
    execute: xvalExecutor(caseId),
    referenceStatus: XVAL_M1_REQUIRED_CASE_IDS.includes(caseId) ? 'ready' : 'pending-reference',
  }));
}

function xvalExecutor(caseId) {
  if (caseId === 'XV-01') return executeXv01;
  if (caseId === 'XV-02') return executeXv02;
  if (['XV-03', 'XV-04', 'XV-07'].includes(caseId)) return executeStaticAnalysis;
  if (['XV-05', 'XV-08'].includes(caseId)) return executeDynamicAnalysis;
  if (caseId === 'XV-06') return executeBucklingAnalysis;
  return null;
}

export function createXvalModel(caseId) {
  switch (caseId) {
    case 'XV-01': return createXv01PortalModel();
    case 'XV-02': return createXv02ThreeStoryModel();
    case 'XV-03': return createXv03BracedFrameModel();
    case 'XV-04': return createXv04PDeltaModel();
    case 'XV-05': return createXv05RsaModel();
    case 'XV-06': return createXv06BucklingModel();
    case 'XV-07': return createXv07SpringSettlementModel();
    case 'XV-08': return createXv08DiaphragmModel();
    default: throw new RangeError(`Unknown Phase 10 cross-validation case: ${caseId}`);
  }
}

export function xv01HandCalculation() {
  const height = 3;
  const pointLoadPerColumn = 10;
  const columnCount = 2;
  const displacement = (pointLoadPerColumn * height ** 3)
    / (3 * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz);
  return {
    static: {
      topDisplacementX: displacement,
      baseReactionX: -(columnCount * pointLoadPerColumn),
      baseMomentY: -(columnCount * pointLoadPerColumn * height),
      columnBaseMomentZ: pointLoadPerColumn * height,
    },
    formulaTrace: {
      displacement: 'P*L^3/(3*E*Iz)',
      reaction: '-2*P',
      baseMoment: '-2*P*L',
      memberMoment: 'P*L',
      inputs: {
        height,
        pointLoadPerColumn,
        columnCount,
        E: BENCH_INTERNAL.E,
        Iz: BENCH_INTERNAL.Iz,
      },
    },
  };
}

export function xv02HandCalculation() {
  const heights = [3, 6, 9];
  const floorLoads = [6, 12, 18];
  const floorMasses = [4, 5, 6];
  const columnCount = 4;
  const totalEI = columnCount * BENCH_INTERNAL.E * BENCH_INTERNAL.Iz;
  const flexibility = heights.map((x) => heights.map((loadHeight) => {
    const a = Math.min(x, loadHeight);
    const b = Math.max(x, loadHeight);
    return (a ** 2 * (3 * b - a)) / (6 * totalEI);
  }));
  const floorDisplacements = multiplyMatrixVector(flexibility, floorLoads);
  const stiffness = invert3x3(flexibility);
  const massNormalizedStiffness = stiffness.map((row, i) => (
    row.map((value, j) => value / Math.sqrt(floorMasses[i] * floorMasses[j]))
  ));
  const eigensystem = symmetricJacobi3(massNormalizedStiffness)
    .map((mode) => {
      const physicalShape = mode.vector.map((value, index) => value / Math.sqrt(floorMasses[index]));
      const generalizedMass = physicalShape.reduce(
        (sum, value, index) => sum + floorMasses[index] * value ** 2,
        0,
      );
      const participationNumerator = physicalShape.reduce(
        (sum, value, index) => sum + floorMasses[index] * value,
        0,
      );
      const effectiveMass = participationNumerator ** 2 / generalizedMass;
      return {
        eigenvalue: mode.value,
        period: (2 * Math.PI) / Math.sqrt(mode.value),
        massRatioX: effectiveMass / floorMasses.reduce((sum, value) => sum + value, 0),
      };
    });

  return {
    static: {
      floor1DisplacementX: floorDisplacements[0],
      floor2DisplacementX: floorDisplacements[1],
      roofDisplacementX: floorDisplacements[2],
      baseReactionX: -floorLoads.reduce((sum, value) => sum + value, 0),
      baseMomentY: -floorLoads.reduce((sum, value, index) => sum + value * heights[index], 0),
      columnBaseMomentZ: floorLoads.reduce((sum, value, index) => sum + value * heights[index], 0) / columnCount,
    },
    modal: Object.fromEntries(eigensystem.flatMap((mode, index) => [
      [`period${index + 1}`, mode.period],
      [`massRatioX${index + 1}`, mode.massRatioX],
    ])),
    formulaTrace: {
      staticFlexibility: 'f_ij=a^2*(3*b-a)/(6*sum(EI)); u=F*P',
      modal: 'K=F^-1; K*phi=lambda*M*phi; T=2*pi/sqrt(lambda)',
      participation: '(phi^T*M*1)^2/((phi^T*M*phi)*sum(m))',
      heights,
      floorLoads,
      floorMasses,
      columnCount,
      totalEI,
      flexibility,
      stiffness,
      eigenvalues: eigensystem.map((mode) => mode.eigenvalue),
    },
  };
}

function createXv01PortalModel() {
  const model = createBenchmarkModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'),
    node('T1', 0, 0, 3),
    node('B2', 4, 0, 0, 'fixed'),
    node('T2', 4, 0, 3),
  ];
  model.members = [
    frame('C1', 'B1', 'T1'),
    frame('C2', 'B2', 'T2'),
    truss('G1', 'T1', 'T2'),
  ];
  model.loads = [
    nodalLoad('P1', 'T1', 10, '+x'),
    nodalLoad('P2', 'T2', 10, '+x'),
  ];
  return model;
}

function createXv02ThreeStoryModel() {
  const model = createBenchmarkModel();
  const masses = [4, 5, 6];
  const floorLoads = [6, 12, 18];
  const corners = [[-2, -2], [2, -2], [2, 2], [-2, 2]];
  model.nodes = [];
  model.members = [];
  for (let story = 0; story <= 3; story += 1) {
    const z = story * 3;
    corners.forEach(([x, y], index) => {
      const corner = index + 1;
      model.nodes.push({
        ...node(`N${story}${corner}`, x, y, z, story === 0 ? 'fixed' : null),
        ...(story ? { mass: [masses[story - 1] / corners.length, 0, 0] } : {}),
      });
      if (story) model.members.push(frame(`C${story}${corner}`, `N${story - 1}${corner}`, `N${story}${corner}`));
    });
  }
  model.diaphragms = [1, 2, 3].map((story) => ({ id: `D${story}`, type: 'rigid', z: story * 3 }));
  model.loads = floorLoads.flatMap((load, index) => {
    const story = index + 1;
    return corners.map((_corner, cornerIndex) => (
      nodalLoad(`P${story}${cornerIndex + 1}`, `N${story}${cornerIndex + 1}`, load / corners.length, '+x')
    ));
  });
  model.analysisSettings = {
    ...model.analysisSettings,
    modalModeCount: 6,
    responseSpectrum: { enabled: false },
  };
  return model;
}

function createXv03BracedFrameModel() {
  const model = createBenchmarkModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'),
    node('B2', 6, 0, 0, 'fixed'),
    node('T1', 0, 0, 4),
    node('T2', 6, 0, 4),
  ];
  model.members = [
    frame('C1', 'B1', 'T1'),
    frame('C2', 'B2', 'T2'),
    { ...frame('G1', 'T1', 'T2'), releases: { i: 'pin', j: 'rigid' } },
    truss('BR1', 'B1', 'T2'),
  ];
  model.loads = [nodalLoad('P1', 'T2', 20, '+x')];
  return model;
}

function createXv04PDeltaModel() {
  const model = createXv02ThreeStoryModel();
  model.loads.push(...[1, 2, 3].flatMap((story) => [1, 2, 3, 4].map((corner) => (
    nodalLoad(`G${story}${corner}`, `N${story}${corner}`, 40, '-z')
  ))));
  model.analysisSettings = {
    ...model.analysisSettings,
    pDelta: true,
    pDeltaMethod: 'direct',
  };
  return model;
}

function createXv05RsaModel() {
  const model = createXv02ThreeStoryModel();
  model.analysisSettings = {
    ...model.analysisSettings,
    modalModeCount: 3,
    responseSpectrum: {
      enabled: true,
      method: 'CQC',
      dampingRatio: 0.05,
      directions: ['x'],
      scale: 1,
      points: [
        { period: 0, sa: 0.4 },
        { period: 0.5, sa: 0.9 },
        { period: 2, sa: 0.3 },
      ],
    },
  };
  return model;
}

function createXv06BucklingModel() {
  const model = createBenchmarkModel();
  model.nodes = [
    node('B1', 0, 0, 0, 'fixed'),
    node('M1', 0, 0, 3),
    node('T1', 0, 0, 6),
    node('B2', 3, 0, 0, 'fixed'),
    node('M2', 3, 0, 3),
    node('T2', 3, 0, 6),
  ];
  model.members = [
    frame('C11', 'B1', 'M1'), frame('C12', 'M1', 'T1'),
    frame('C21', 'B2', 'M2'), frame('C22', 'M2', 'T2'),
    truss('G1', 'M1', 'M2'), truss('G2', 'T1', 'T2'),
  ];
  model.loads = [
    nodalLoad('P1', 'T1', 100, '-z'),
    nodalLoad('P2', 'T2', 100, '-z'),
    nodalLoad('H1', 'T1', 1, '+x'),
  ];
  model.analysisSettings = { ...model.analysisSettings, globalBucklingModeCount: 5 };
  return model;
}

function createXv07SpringSettlementModel() {
  const model = createBenchmarkModel();
  model.nodes = [
    {
      ...node('S1', 0, 0, 0, 'spring'),
      spring: { kx: 2e5, ky: 2e5, kz: 5e5, krx: 5e4, kry: 5e4, krz: 5e4 },
      settlement: { uz: -0.002 },
    },
    node('F1', 5, 0, 0, 'fixed'),
  ];
  model.members = [frame('G1', 'S1', 'F1')];
  model.loads = [nodalLoad('P1', 'S1', 12, '-z')];
  return model;
}

function createXv08DiaphragmModel() {
  const model = createBenchmarkModel();
  const xy = [[0, 0], [5, 0], [5, 4], [0, 4]];
  model.nodes = [];
  model.members = [];
  for (let story = 0; story <= 2; story += 1) {
    const z = story * 3;
    xy.forEach(([x, y], index) => {
      model.nodes.push({
        ...node(`N${story}${index + 1}`, x, y, z, story === 0 ? 'fixed' : null),
        ...(story ? { mass: [1, 1, 0] } : {}),
      });
      if (story) model.members.push(frame(`C${story}${index + 1}`, `N${story - 1}${index + 1}`, `N${story}${index + 1}`));
    });
    if (story) {
      for (let index = 0; index < 4; index += 1) {
        model.members.push(frame(`G${story}${index + 1}`, `N${story}${index + 1}`, `N${story}${(index + 1) % 4 + 1}`));
      }
    }
  }
  model.diaphragms = [
    { id: 'D1', type: 'rigid', nodeIds: ['N11', 'N12', 'N13', 'N14'] },
    {
      id: 'D2',
      type: 'semiRigid',
      nodeIds: ['N21', 'N22', 'N23', 'N24'],
      inPlaneStiffness: 2e5,
    },
  ];
  model.loads = [
    nodalLoad('P1', 'N12', 8, '+x'),
    nodalLoad('P2', 'N22', 12, '+x'),
  ];
  return model;
}

function executeXv01(model) {
  const analysis = analyzeModel(model);
  if (!analysis.ok) throw new Error(`XV-01 analysis failed: ${analysis.validation?.errors?.map((item) => item.code).join(',')}`);
  const result = analysis.byCombo.D_ONLY;
  return {
    static: {
      topDisplacementX: average(result.disp.T1[0], result.disp.T2[0]),
      baseReactionX: result.reactions.B1.rx + result.reactions.B2.rx,
      baseMomentY: result.reactions.B1.rmy + result.reactions.B2.rmy,
      columnBaseMomentZ: result.memberResults.C1.Mzmax,
    },
  };
}

function executeXv02(model) {
  const analysis = analyzeModel(model);
  if (!analysis.ok) throw new Error(`XV-02 static analysis failed: ${analysis.validation?.errors?.map((item) => item.code).join(',')}`);
  const dynamics = analyzeDynamics(model);
  const xModes = dynamics.modes.filter((mode) => mode.participation.x.massRatio > 1e-8).slice(0, 3);
  if (!dynamics.ok || xModes.length < 3) throw new Error(`XV-02 modal analysis failed: ${dynamics.reason || 'insufficient X modes'}`);
  const result = analysis.byCombo.D_ONLY;
  const floorDisplacement = (story) => averageMany([1, 2, 3, 4].map((corner) => result.disp[`N${story}${corner}`][0]));
  const baseNodes = [1, 2, 3, 4].map((corner) => `N0${corner}`);
  return {
    static: {
      floor1DisplacementX: floorDisplacement(1),
      floor2DisplacementX: floorDisplacement(2),
      roofDisplacementX: floorDisplacement(3),
      baseReactionX: baseNodes.reduce((sum, id) => sum + result.reactions[id].rx, 0),
      baseMomentY: baseNodes.reduce((sum, id) => sum + result.reactions[id].rmy, 0),
      columnBaseMomentZ: result.memberResults.C11.Mzmax,
    },
    modal: Object.fromEntries(xModes.flatMap((mode, index) => [
      [`period${index + 1}`, mode.period],
      [`massRatioX${index + 1}`, mode.participation.x.massRatio],
    ])),
  };
}

function executeStaticAnalysis(model) {
  return { analysis: analyzeModel(model) };
}

function executeDynamicAnalysis(model) {
  return {
    analysis: analyzeModel(model),
    dynamics: analyzeDynamics(model),
  };
}

function executeBucklingAnalysis(model) {
  const analysis = analyzeModel(model);
  return {
    analysis,
    buckling: estimateGlobalBucklingTrace(model, {
      modeCount: 5,
      preloadResult: analysis,
      preloadCombinationId: 'D_ONLY',
    }),
  };
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

function truss(id, n1, n2) {
  return { ...frame(id, n1, n2), type: 'truss' };
}

function node(id, x, y, z, support = null) {
  return { id, x, y, z, support };
}

function nodalLoad(id, nodeId, magnitude, dir) {
  return { id, type: 'nodal', node: nodeId, P: magnitude, dir, case: 'D' };
}

function average(a, b) {
  return (Number(a) + Number(b)) / 2;
}

function averageMany(values) {
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function invert3x3(matrix) {
  const [a, b, c] = matrix[0];
  const [d, e, f] = matrix[1];
  const [g, h, i] = matrix[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const determinant = a * A + b * B + c * C;
  if (Math.abs(determinant) < 1e-18) throw new RangeError('XV-02 hand-calc flexibility matrix is singular.');
  return [
    [A / determinant, D / determinant, G / determinant],
    [B / determinant, E / determinant, H / determinant],
    [C / determinant, F / determinant, I / determinant],
  ];
}

function symmetricJacobi3(input) {
  const matrix = input.map((row) => [...row]);
  const vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let iteration = 0; iteration < 64; iteration += 1) {
    let p = 0;
    let q = 1;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(matrix[i][j]) > Math.abs(matrix[p][q])) [p, q] = [i, j];
    }
    if (Math.abs(matrix[p][q]) < 1e-13) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const app = matrix[p][p];
    const aqq = matrix[q][q];
    const apq = matrix[p][q];
    matrix[p][p] = cosine ** 2 * app - 2 * sine * cosine * apq + sine ** 2 * aqq;
    matrix[q][q] = sine ** 2 * app + 2 * sine * cosine * apq + cosine ** 2 * aqq;
    matrix[p][q] = 0;
    matrix[q][p] = 0;
    for (let index = 0; index < 3; index += 1) {
      if (index === p || index === q) continue;
      const aip = matrix[index][p];
      const aiq = matrix[index][q];
      matrix[index][p] = cosine * aip - sine * aiq;
      matrix[p][index] = matrix[index][p];
      matrix[index][q] = sine * aip + cosine * aiq;
      matrix[q][index] = matrix[index][q];
    }
    for (let index = 0; index < 3; index += 1) {
      const vip = vectors[index][p];
      const viq = vectors[index][q];
      vectors[index][p] = cosine * vip - sine * viq;
      vectors[index][q] = sine * vip + cosine * viq;
    }
  }
  return [0, 1, 2]
    .map((index) => ({
      value: matrix[index][index],
      vector: vectors.map((row) => row[index]),
    }))
    .sort((left, right) => left.value - right.value);
}
