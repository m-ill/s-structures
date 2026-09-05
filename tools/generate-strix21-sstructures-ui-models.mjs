import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REPORT_ROOT = resolve(ROOT, '..', 'testreport', 'STRIX-21-검증');
const OUTPUT_ROOT = join(ROOT, 'output', 'playwright', 'strix21-ui-capture');

const CASES = [
  ['SB2', '02_SB2_NAFEMS_LE1_Elliptic_Membrane', 'NAFEMS LE1 elliptic membrane', 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB3', '03_SB3_Cooks_Membrane', "Cook's membrane", 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB5', '04_SB5_Thin_Rectangular_Plate', 'Thin rectangular plate bending', 'plan', 'DIRECT_NUMERIC_PASS'],
  ['SB6', '05_SB6_Thick_Rectangular_Plate', 'Thick rectangular plate bending', 'plan', 'DIRECT_NUMERIC_PASS'],
  ['SB7', '06_SB7_Winkler_Beam', 'Beam on Winkler elastic foundation', 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB8', '07_SB8_Timoshenko_Beam_Frequencies', 'Timoshenko beam natural frequencies', 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB9', '08_SB9_Portal_Frame_UDL', 'Portal frame under UDL', 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB10', '09_SB10_Two_Bar_Truss', 'Asymmetric two-bar truss', 'front', 'DIRECT_NUMERIC_PASS'],
  ['SB12', '10_SB12_Elastic_Link_Beta_Angle', 'Elastic link beta-angle transformation', '3d', 'ENGINE_PASS_OFFICIAL_NOT_CLAIMED'],
  ['PD1', '11_PD1_PDelta_Tension_Stiffening', 'P-Delta tension stiffening', 'front', 'NUMERIC_PASS_QUALIFICATION_OPEN'],
  ['SM5', '12_SM5_Bathe_Wilson_Frame', 'Bathe-Wilson 10-bay 9-storey frame', 'front', 'NUMERIC_PASS_QUALIFICATION_OPEN'],
  ['SM5b', '13_SM5b_Rigid_Diaphragm_Condensation', 'Eccentric rigid-diaphragm building', '3d', 'ENGINE_PASS_SOURCE_BLOCKED'],
  ['SM6', '14_SM6_ASME_3D_Eigen_Frame', 'ASME 3-D fixed-base pipe frame', '3d', 'ENGINE_PASS_SOURCE_BLOCKED'],
  ['SR1', '15_SR1_Two_Dimensional_Response_Spectrum', '2-D rigid-frame response spectrum', 'front', 'ENGINE_PASS_SOURCE_BLOCKED'],
  ['SR2', '16_SR2_Three_Dimensional_Eccentric_RSA', '3-D eccentric rigid-diaphragm response spectrum', '3d', 'ENGINE_PASS_SOURCE_BLOCKED'],
  ['SR2b', '17_SR2b_L_Shaped_Braced_RSA', '3-D L-shaped braced-frame response spectrum', '3d', 'ENGINE_PASS_SOURCE_BLOCKED'],
  ['P3S2', '18_P3S2_Stabilization_Sensitivity', 'Wall shell stabilization sensitivity', 'front', 'EQUIVALENT_ENGINE_GATE'],
  ['SP1', '19_SP1_Pushover_Moment_Hinge', 'Pushover cantilever moment hinge', 'front', 'EQUIVALENT_ENGINE_GATE'],
  ['SH1', '20_SH1_PMM_Hinge', '3-D column P-M-M hinge', '3d', 'ENGINE_CHECKPOINT'],
  ['TH1', '21_TH1_SDOF_Newmark_THA', 'SDOF Newmark time-history anchor', 'front', 'ENGINE_CHECKPOINT'],
];

const caseIndex = new Map(CASES.map((row) => [row[0], row]));

function baseModel(id, title, boundary) {
  return {
    schemaVersion: 3,
    units: { length: 'm', force: 'kN', moment: 'kN.m', stress: 'N/mm2', displacement: 'mm' },
    materials: [{ id: `${id}-MAT`, version: 1, name: `${id} elastic material`, E: 200000, G: 76923.076923, density: 0, Fy: 1e9, Fu: 1e9 }],
    sections: [{ id: `${id}-SEC`, version: 1, name: `${id} display/analysis section`, type: 'direct', A: 0.02, Iy: 8e-4, Iz: 8e-4, J: 1.6e-3, Ay: 0.016, Az: 0.016, Zy: 0.004, Zz: 0.004 }],
    nodes: [],
    members: [],
    shells: [],
    links: [],
    loads: [],
    loadCases: [{ id: 'D', name: `${id} benchmark load`, type: 'other' }],
    loadCombinations: [{ id: 'D_ONLY', name: '1.0D', type: 'service', factors: { D: 1 } }],
    analysisCases: [],
    analysisSettings: { analysisType: 'linear_static', elementType: '3d_frame', includeShearDeformation: false, includeGeometricStiffness: false, includeSelfWeight: false, solverTolerance: 1e-10, memberStations: 21, validateBeforeSolve: true, modalModeCount: 6 },
    designParams: { global: { mode: 'off', codeCompliance: false }, rc: {}, members: {} },
    designSettings: { method: 'allowable_stress', defaultCheck: 'elastic_stress_interaction' },
    meta: {
      id: `STRIX21-${id}-UI-R4`,
      name: `${id} | ${title}`,
      benchmarkId: id,
      verificationBoundary: boundary,
      purpose: 'Actual S-Structures modeler capture for the Korean verification report',
      modelRole: boundary.startsWith('DIRECT_') || boundary.startsWith('NUMERIC_') ? 'benchmark-topology model' : 'production-engine qualification fixture topology',
      shellDisplayRule: 'Shell records are retained; frame mesh edges tagged uiDisplayOnly visualize topology in the current native canvas.',
    },
  };
}

function node(model, id, x, y, z, extra = {}) {
  model.nodes.push({ id, x, y, z, ...extra });
  return id;
}

function member(model, id, n1, n2, extra = {}) {
  model.members.push({ id, type: extra.type || 'frame', n1, n2, matId: `${model.meta.benchmarkId}-MAT`, secId: `${model.meta.benchmarkId}-SEC`, localAxis: { roll: 0, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' }, ...extra });
  return id;
}

function frameGrid(model, { nx, nz, point, shell = false, prefix = model.meta.benchmarkId, support = () => null }) {
  const ids = [];
  for (let j = 0; j <= nz; j += 1) {
    ids[j] = [];
    for (let i = 0; i <= nx; i += 1) {
      const [x, y, z] = point(i / nx, j / nz, i, j);
      const supportData = support(i, j, nx, nz) || {};
      ids[j][i] = node(model, `${prefix}-N${j}-${i}`, x, y, z, supportData);
    }
  }
  const edgeMap = new Map();
  const addEdge = (a, b) => {
    const key = [a, b].sort().join('|');
    if (edgeMap.has(key)) return;
    const id = `${prefix}-G${edgeMap.size + 1}`;
    edgeMap.set(key, id);
    member(model, id, a, b, { uiDisplayOnly: shell, category: shell ? 'shell-mesh-edge' : 'benchmark-member' });
  };
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i < nx; i += 1) addEdge(ids[j][i], ids[j][i + 1]);
  for (let j = 0; j < nz; j += 1) for (let i = 0; i <= nx; i += 1) addEdge(ids[j][i], ids[j + 1][i]);
  if (shell) {
    for (let j = 0; j < nz; j += 1) for (let i = 0; i < nx; i += 1) {
      model.shells.push({ id: `${prefix}-S${j}-${i}`, type: 'shell4', nodeIds: [ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]], matId: `${model.meta.benchmarkId}-MAT`, thickness: 0.1, formulation: 'shell' });
    }
  }
  return ids;
}

function addPerimeterBeams(model, ids, prefix) {
  const nz = ids.length - 1;
  const nx = ids[0].length - 1;
  for (let i = 0; i < nx; i += 1) {
    member(model, `${prefix}-B0-${i}`, ids[0][i], ids[0][i + 1]);
    member(model, `${prefix}-BT-${i}`, ids[nz][i], ids[nz][i + 1]);
  }
  for (let j = 0; j < nz; j += 1) {
    member(model, `${prefix}-BL-${j}`, ids[j][0], ids[j + 1][0]);
    member(model, `${prefix}-BR-${j}`, ids[j][nx], ids[j + 1][nx]);
  }
}

function buildSb2() {
  const m = baseModel('SB2', caseIndex.get('SB2')[2], caseIndex.get('SB2')[4]);
  const ids = frameGrid(m, {
    nx: 7, nz: 3, shell: true, prefix: 'SB2',
    point: (u, v) => { const a = 2 + 2 * v; const b = 1 + 1.2 * v; const t = u * Math.PI / 2; return [a * Math.cos(t), 0, b * Math.sin(t)]; },
    support: (i, j, nx) => i === 0 ? { support: 'custom', fix: [false, true, false, true, true, true] } : i === nx ? { support: 'custom', fix: [true, true, false, true, true, true] } : null,
  });
  ids.at(-1).forEach((nid, i) => m.loads.push({ id: `SB2-P${i}`, type: 'nodal', node: nid, P: 4, dir: '+x', case: 'D' }));
  m.shells.forEach((shell) => { shell.formulation = 'membrane'; });
  m.analysisCases = [{ id: 'SB2-MEMBRANE', kind: 'static', settings: { shellFormulation: 'membrane', planeStress: true } }];
  return m;
}

function buildSb3() {
  const m = baseModel('SB3', caseIndex.get('SB3')[2], caseIndex.get('SB3')[4]);
  const ids = frameGrid(m, {
    nx: 8, nz: 5, shell: true, prefix: 'SB3',
    point: (u, v) => [12 * u, 0, (4 + 6 * u) * v + 0.8 * u],
    support: (i) => i === 0 ? { support: 'fixed' } : null,
  });
  ids.map((row) => row.at(-1)).forEach((nid, i) => m.loads.push({ id: `SB3-P${i}`, type: 'nodal', node: nid, P: 1.25, dir: '+z', case: 'D' }));
  m.shells.forEach((shell) => { shell.formulation = 'membrane'; });
  m.analysisCases = [{ id: 'SB3-MEMBRANE', kind: 'static', settings: { shellFormulation: 'membrane', distortedMesh: true } }];
  return m;
}

function buildPlate(id, nx, ny, thick) {
  const m = baseModel(id, caseIndex.get(id)[2], caseIndex.get(id)[4]);
  const ids = frameGrid(m, {
    nx, nz: ny, shell: true, prefix: id,
    point: (u, v) => [10 * u, 8 * v, 0],
    support: (i, j, maxI, maxJ) => (i === 0 || j === 0 || i === maxI || j === maxJ) ? { support: 'custom', fix: [false, false, true, false, false, false] } : null,
  });
  m.shells.forEach((s) => { s.thickness = thick; s.formulation = 'plate'; s.plateTheory = id === 'SB5' ? 'thin-kirchhoff-mindlin' : 'thick-mindlin'; });
  const center = ids[Math.floor(ny / 2)][Math.floor(nx / 2)];
  m.loads.push({ id: `${id}-CENTER-P`, type: 'nodal', node: center, P: 10, dir: '-z', case: 'D' });
  m.analysisCases = [{ id: `${id}-PLATE`, kind: 'static', settings: { shellFormulation: id === 'SB5' ? 'thinPlate' : 'thickPlate', thickness: thick } }];
  return m;
}

function buildSb7() {
  const m = baseModel('SB7', caseIndex.get('SB7')[2], caseIndex.get('SB7')[4]);
  const count = 16;
  const beamIds = [];
  for (let i = 0; i <= count; i += 1) {
    const x = 15 * i / count;
    beamIds.push(node(m, `SB7-N${i}`, x, 0, 1.5));
    const ground = node(m, `SB7-G${i}`, x, 0, 0, { support: 'fixed', uiFoundationAnchor: true });
    member(m, `SB7-SPR${i}`, ground, beamIds.at(-1), { type: 'truss', uiDisplayOnly: true, category: 'winkler-spring-symbol' });
  }
  for (let i = 0; i < count; i += 1) member(m, `SB7-M${i + 1}`, beamIds[i], beamIds[i + 1], { foundationId: 'SB7-WINKLER' });
  m.foundations = [{ id: 'SB7-WINKLER', type: 'winkler', direction: 'global-z', modulus: 68000, integration: 'consistent', assignedMembers: Array.from({ length: count }, (_v, i) => `SB7-M${i + 1}`) }];
  m.loads.push({ id: 'SB7-P', type: 'nodal', node: beamIds[count / 2], P: 100, dir: '-z', case: 'D' });
  m.analysisCases = [{ id: 'SB7-STATIC', kind: 'static', settings: { foundationIntegration: 'consistent' } }];
  return m;
}

function buildSb8() {
  const m = baseModel('SB8', caseIndex.get('SB8')[2], caseIndex.get('SB8')[4]);
  const count = 16;
  for (let i = 0; i <= count; i += 1) node(m, `SB8-N${i}`, 3 * i / count, 0, 0, { ...(i === 0 || i === count ? { support: 'custom', fix: [i === 0, true, true, true, false, true] } : {}), mass: [0, 0, i === 0 || i === count ? 0.135 : 0.27, 0, 0, 0] });
  for (let i = 0; i < count; i += 1) member(m, `SB8-M${i + 1}`, `SB8-N${i}`, `SB8-N${i + 1}`, { shearDeformation: true });
  m.massSources = [{ id: 'SB8-MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  m.analysisSettings = { ...m.analysisSettings, includeShearDeformation: true, shearDeformation: true, analysisType: 'modal', modalModeCount: 6 };
  m.analysisCases = [{ id: 'SB8-MODAL', kind: 'modal', settings: { modeCount: 6, shearDeformation: true } }];
  return m;
}

function buildSb9() {
  const m = baseModel('SB9', caseIndex.get('SB9')[2], caseIndex.get('SB9')[4]);
  const span = 7.3152; const height = 3.6576; const n = 8;
  node(m, 'SB9-BL', 0, 0, 0, { support: 'fixed' }); node(m, 'SB9-BR', span, 0, 0, { support: 'fixed' });
  for (let i = 0; i <= n; i += 1) node(m, `SB9-T${i}`, span * i / n, 0, height);
  member(m, 'SB9-CL', 'SB9-BL', 'SB9-T0'); member(m, 'SB9-CR', 'SB9-BR', `SB9-T${n}`);
  for (let i = 0; i < n; i += 1) { const mid = member(m, `SB9-B${i + 1}`, `SB9-T${i}`, `SB9-T${i + 1}`); m.loads.push({ id: `SB9-W${i + 1}`, type: 'udl', member: mid, w: 1.751, dir: '-z', case: 'D' }); }
  return m;
}

function buildSb10() {
  const m = baseModel('SB10', caseIndex.get('SB10')[2], caseIndex.get('SB10')[4]);
  node(m, 'SB10-N1', -3, 0, 4, { support: 'fixed' }); node(m, 'SB10-N2', 4, 0, 3, { support: 'fixed' }); node(m, 'SB10-N3', 0, 0, 0, { support: 'custom', fix: [false, true, false, true, true, true] });
  member(m, 'SB10-E1', 'SB10-N3', 'SB10-N1', { type: 'truss' }); member(m, 'SB10-E2', 'SB10-N3', 'SB10-N2', { type: 'truss' });
  m.loads.push({ id: 'SB10-PX', type: 'nodal', node: 'SB10-N3', P: 10, dir: '-x', case: 'D' }, { id: 'SB10-PZ', type: 'nodal', node: 'SB10-N3', P: 20, dir: '-z', case: 'D' });
  return m;
}

function buildSb12() {
  const m = baseModel('SB12', caseIndex.get('SB12')[2], caseIndex.get('SB12')[4]);
  node(m, 'SB12-I1', 0, 0, 0, { support: 'fixed' }); node(m, 'SB12-J1', 5, 3.33, 2.5); node(m, 'SB12-I2', 8, 0, 0, { support: 'fixed' }); node(m, 'SB12-J2', 8, 0, 5);
  member(m, 'SB12-VIS1', 'SB12-I1', 'SB12-J1', { uiDisplayOnly: true, category: 'elastic-link-axis' }); member(m, 'SB12-VIS2', 'SB12-I2', 'SB12-J2', { uiDisplayOnly: true, category: 'elastic-link-axis' });
  m.links = [
    { id: 'SB12-LINK-OBLIQUE', type: 'twoNodeLink6Dof', i: 'SB12-I1', j: 'SB12-J1', betaDeg: 25, shearDistance: 0.5, stiffness: [480, 675, 930, 8200000, 13500000, 19800000] },
    { id: 'SB12-LINK-VERTICAL', type: 'twoNodeLink6Dof', i: 'SB12-I2', j: 'SB12-J2', betaDeg: -40, shearDistance: 0.5, stiffness: [480, 675, 930, 8200000, 13500000, 19800000] },
  ];
  m.loads.push({ id: 'SB12-P1', type: 'nodal', node: 'SB12-J1', P: 120, dir: '+x', case: 'D' }, { id: 'SB12-P2', type: 'nodal', node: 'SB12-J2', P: 85, dir: '-y', case: 'D' });
  m.analysisCases = [{ id: 'SB12-LINK', kind: 'static', settings: { element: 'twoNodeLink6Dof', betaAngle: true } }];
  return m;
}

function buildPd1() {
  const m = baseModel('PD1', caseIndex.get('PD1')[2], caseIndex.get('PD1')[4]);
  const n = 16; const L = 7.62;
  for (let i = 0; i <= n; i += 1) node(m, `PD1-N${i}`, L * i / n, 0, 0, { ...(i === 0 || i === n ? { support: 'custom', fix: [i === 0, true, true, true, false, true] } : {}) });
  for (let i = 0; i < n; i += 1) { const id = member(m, `PD1-M${i + 1}`, `PD1-N${i}`, `PD1-N${i + 1}`); m.loads.push({ id: `PD1-W${i + 1}`, type: 'udl', member: id, w: 0.35, dir: '-z', case: 'D' }); }
  m.loadCases.push({ id: 'T', name: 'Axial tension', type: 'other' }); m.loadCombinations = [{ id: 'W_T', name: 'W+T', type: 'service', factors: { D: 1, T: 1 } }];
  m.loads.push({ id: 'PD1-T', type: 'nodal', node: `PD1-N${n}`, P: 90, dir: '+x', case: 'T' });
  m.analysisSettings = { ...m.analysisSettings, analysisType: 'pdelta', includeGeometricStiffness: true, pDeltaMaxIterations: 30 };
  m.analysisCases = [{ id: 'PD1-PDELTA', kind: 'static', settings: { geometricNonlinearity: 'PDelta', loadSteps: 8 } }];
  return m;
}

function buildSm5() {
  const m = baseModel('SM5', caseIndex.get('SM5')[2], caseIndex.get('SM5')[4]);
  const bays = 10; const stories = 9; const bay = 1.6; const story = 1.0;
  const ids = [];
  for (let j = 0; j <= stories; j += 1) { ids[j] = []; for (let i = 0; i <= bays; i += 1) ids[j][i] = node(m, `SM5-N${j}-${i}`, i * bay, 0, j * story, j === 0 ? { support: 'fixed' } : { mass: [12, 0, 12, 0, 0, 0] }); }
  for (let j = 0; j < stories; j += 1) for (let i = 0; i <= bays; i += 1) member(m, `SM5-C${j}-${i}`, ids[j][i], ids[j + 1][i]);
  for (let j = 1; j <= stories; j += 1) for (let i = 0; i < bays; i += 1) member(m, `SM5-B${j}-${i}`, ids[j][i], ids[j][i + 1]);
  m.massSources = [{ id: 'SM5-MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  m.analysisSettings = { ...m.analysisSettings, analysisType: 'modal', modalModeCount: 3 };
  m.analysisCases = [{ id: 'SM5-MODAL', kind: 'modal', settings: { modeCount: 3 } }];
  return m;
}

function build3dBuilding(id, { stories = 2, lShape = false, braces = false, eccentric = false } = {}) {
  const m = baseModel(id, caseIndex.get(id)[2], caseIndex.get(id)[4]);
  const plan = lShape ? [[0, 0], [4, 0], [8, 0], [0, 4], [4, 4], [0, 8]] : [[0, 0], [6, 0], [6, 4], [0, 4]];
  const levels = [];
  for (let k = 0; k <= stories; k += 1) {
    levels[k] = plan.map(([x, y], i) => node(m, `${id}-N${k}-${i}`, x, y, 3 * k, k === 0 ? { support: 'fixed' } : { mass: [8, 8, 0, 0, 0, eccentric ? 18 : 8] }));
  }
  for (let k = 0; k < stories; k += 1) for (let i = 0; i < plan.length; i += 1) member(m, `${id}-C${k}-${i}`, levels[k][i], levels[k + 1][i]);
  const floorEdges = lShape ? [[0,1],[1,2],[0,3],[3,4],[3,5],[1,4]] : [[0,1],[1,2],[2,3],[3,0]];
  for (let k = 1; k <= stories; k += 1) for (const [a,b] of floorEdges) member(m, `${id}-B${k}-${a}-${b}`, levels[k][a], levels[k][b]);
  if (braces) for (let k = 0; k < stories; k += 1) { member(m, `${id}-X1-${k}`, levels[k][0], levels[k + 1][1], { type: 'truss' }); member(m, `${id}-X2-${k}`, levels[k][1], levels[k + 1][0], { type: 'truss' }); }
  m.diaphragms = Array.from({ length: stories }, (_v, k) => ({ id: `${id}-DIA-${k + 1}`, type: 'rigid', masterNode: levels[k + 1][eccentric ? 1 : 0], nodes: levels[k + 1], dofs: ['ux','uy','rz'], eccentric }));
  m.massSources = [{ id: `${id}-MS`, version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  m.analysisSettings = { ...m.analysisSettings, analysisType: id === 'SM5b' || id === 'SM6' ? 'modal' : 'responseSpectrum', modalModeCount: 6 };
  m.analysisCases = [{ id: `${id}-${m.analysisSettings.analysisType.toUpperCase()}`, kind: m.analysisSettings.analysisType === 'modal' ? 'modal' : 'responseSpectrum', settings: { modeCount: 6, combination: 'CQC' } }];
  return m;
}

function buildSm6() {
  const m = build3dBuilding('SM6', { stories: 3 });
  m.meta.name = 'SM6 | ASME 3-D fixed-base pipe frame';
  m.members.forEach((row) => { row.sectionFamily = 'pipe'; });
  return m;
}

function buildSr1() {
  const m = baseModel('SR1', caseIndex.get('SR1')[2], caseIndex.get('SR1')[4]);
  const bays = 3; const stories = 4; const ids = [];
  for (let j = 0; j <= stories; j += 1) { ids[j] = []; for (let i = 0; i <= bays; i += 1) ids[j][i] = node(m, `SR1-N${j}-${i}`, 4 * i, 0, 3 * j, j === 0 ? { support: 'fixed' } : { mass: [10, 0, 0, 0, 0, 0] }); }
  for (let j = 0; j < stories; j += 1) for (let i = 0; i <= bays; i += 1) member(m, `SR1-C${j}-${i}`, ids[j][i], ids[j + 1][i]);
  for (let j = 1; j <= stories; j += 1) for (let i = 0; i < bays; i += 1) member(m, `SR1-B${j}-${i}`, ids[j][i], ids[j][i + 1]);
  m.massSources = [{ id: 'SR1-MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }];
  m.analysisSettings = { ...m.analysisSettings, analysisType: 'responseSpectrum', modalModeCount: 6 };
  m.analysisCases = [{ id: 'SR1-RSA', kind: 'responseSpectrum', settings: { modeCount: 6, combination: 'CQC', direction: 'x' } }];
  return m;
}

function buildP3s2() {
  const m = baseModel('P3S2', caseIndex.get('P3S2')[2], caseIndex.get('P3S2')[4]);
  frameGrid(m, { nx: 5, nz: 9, shell: true, prefix: 'P3S2', point: (u, v) => [4 * u, 0, 12 * v], support: (_i, j) => j === 0 ? { support: 'fixed' } : null });
  m.shells.forEach((s) => { s.formulation = 'shell'; s.shellRole = 'wall'; s.stabilizationParameter = 1e-6; s.thickness = 0.25; });
  m.analysisCases = [{ id: 'P3S2-MODAL', kind: 'modal', settings: { modeCount: 6, shellStabilization: 1e-6 } }];
  return m;
}

function buildSp1() {
  const m = baseModel('SP1', caseIndex.get('SP1')[2], caseIndex.get('SP1')[4]);
  const n = 8;
  for (let i = 0; i <= n; i += 1) node(m, `SP1-N${i}`, 0, 0, 6 * i / n, i === 0 ? { support: 'fixed' } : {});
  for (let i = 0; i < n; i += 1) member(m, `SP1-M${i + 1}`, `SP1-N${i}`, `SP1-N${i + 1}`, { ...(i === 0 ? { hingeJ: 'SP1-HINGE' } : {}) });
  m.hingeProperties = [{ id: 'SP1-HINGE', type: 'moment-rotation', scope: 'member-end', curve: [[0,0],[0.01,120],[0.05,135],[0.12,105]] }];
  m.loads.push({ id: 'SP1-PUSH', type: 'nodal', node: `SP1-N${n}`, P: 50, dir: '+x', case: 'D' });
  m.analysisCases = [{ id: 'SP1-PUSHOVER', kind: 'pushover', settings: { controlNode: `SP1-N${n}`, controlDof: 'ux', targetDisplacement: 0.25 } }];
  return m;
}

function buildSh1() {
  const m = baseModel('SH1', caseIndex.get('SH1')[2], caseIndex.get('SH1')[4]);
  node(m, 'SH1-N0', 0, 0, 0, { support: 'fixed' }); node(m, 'SH1-N1', 0, 0, 3); node(m, 'SH1-N2', 0.8, 0.5, 6);
  member(m, 'SH1-C1', 'SH1-N0', 'SH1-N1', { hingeJ: 'SH1-PMM' }); member(m, 'SH1-C2', 'SH1-N1', 'SH1-N2');
  m.hingeProperties = [{ id: 'SH1-PMM', type: 'pmm-3d', scope: 'member-end', axialCompressionPositive: true, interactionSurface: 'custom-DcrPMMHinge3d' }];
  m.loads.push({ id: 'SH1-P', type: 'nodal', node: 'SH1-N2', P: 250, dir: '-z', case: 'D' }, { id: 'SH1-HX', type: 'nodal', node: 'SH1-N2', P: 40, dir: '+x', case: 'D' }, { id: 'SH1-HY', type: 'nodal', node: 'SH1-N2', P: 25, dir: '+y', case: 'D' });
  m.analysisCases = [{ id: 'SH1-NL', kind: 'pushover', settings: { hingeType: 'pmm-3d', biaxial: true } }];
  return m;
}

function buildTh1() {
  const m = baseModel('TH1', caseIndex.get('TH1')[2], caseIndex.get('TH1')[4]);
  node(m, 'TH1-GROUND', 0, 0, 0, { support: 'fixed' }); node(m, 'TH1-MASS', 0, 0, 4, { mass: [10, 0, 0, 0, 0, 0] });
  member(m, 'TH1-SPRING-VIS', 'TH1-GROUND', 'TH1-MASS', { uiDisplayOnly: true, category: 'sdof-spring-axis' });
  m.links = [{ id: 'TH1-SPRING', type: 'twoNodeLink6Dof', i: 'TH1-GROUND', j: 'TH1-MASS', stiffness: [400, 1e12, 1e12, 1e12, 1e12, 1e12], damping: [20, 0, 0, 0, 0, 0] }];
  m.timeHistoryFunctions = [{ id: 'TH1-GM', type: 'acceleration', dt: 0.02, values: [0,0.12,-0.08,0.18,-0.11,0.05,0] }];
  m.analysisCases = [{ id: 'TH1-THA', kind: 'timeHistory', settings: { method: 'newmark-average-acceleration', beta: 0.25, gamma: 0.5, dt: 0.02, functionId: 'TH1-GM' } }];
  return m;
}

const BUILDERS = {
  SB2: buildSb2, SB3: buildSb3, SB5: () => buildPlate('SB5', 8, 6, 0.05), SB6: () => buildPlate('SB6', 6, 4, 0.8),
  SB7: buildSb7, SB8: buildSb8, SB9: buildSb9, SB10: buildSb10, SB12: buildSb12, PD1: buildPd1, SM5: buildSm5,
  SM5b: () => build3dBuilding('SM5b', { stories: 3, eccentric: true }), SM6: buildSm6, SR1: buildSr1,
  SR2: () => build3dBuilding('SR2', { stories: 2, eccentric: true }), SR2b: () => build3dBuilding('SR2b', { stories: 2, lShape: true, braces: true, eccentric: true }),
  P3S2: buildP3s2, SP1: buildSp1, SH1: buildSh1, TH1: buildTh1,
};

function makeBook(id, model) {
  const showIds = model.members.length <= 30 && !['SB8', 'PD1'].includes(id);
  return {
    format: 's-structures-book-v3',
    version: 3,
    generatedAt: '2026-08-30',
    pages: [{ name: `${id} | ${model.meta.name.split('|').slice(1).join('|').trim()}`, strokes: [], images: [], model }],
    display: { def: false, M: false, Q: false, N: false, T: false, react: false, val: false, chk: false, nid: showIds, mid: showIds, axes: false, len: false, design: false, defl: false },
  };
}

function sha256(text) { return createHash('sha256').update(text).digest('hex'); }

await mkdir(join(OUTPUT_ROOT, 'models'), { recursive: true });
const manifest = [];
for (const [id, folder, title, view, boundary] of CASES) {
  const model = BUILDERS[id]();
  const book = makeBook(id, model);
  const text = `${JSON.stringify(book, null, 2)}\n`;
  const captureModelPath = join(OUTPUT_ROOT, 'models', `${id}-S-Structures-book-R4.json`);
  const caseModelDir = join(REPORT_ROOT, folder, '02_모델');
  const caseModelPath = join(caseModelDir, `${id}_S-Structures_실제모델_R4.json`);
  await mkdir(caseModelDir, { recursive: true });
  await writeFile(captureModelPath, text, 'utf8');
  await writeFile(caseModelPath, text, 'utf8');
  const note = `# ${id} S-Structures 실제 모델 R4\n\n- 벤치마크: ${title}\n- 화면 방향: ${view}\n- 검증 경계: ${boundary}\n- 절점: ${model.nodes.length}\n- 화면 부재: ${model.members.length}\n- 셸 레코드: ${model.shells.length}\n- 링크 레코드: ${model.links.length}\n\n이 파일은 S-Structures의 \`JSON 가져오기 (v1 2D 호환)\` 메뉴로 직접 불러오는 책 형식이다. 셸 문제의 \`uiDisplayOnly\` 메시 선은 현재 네이티브 캔버스에서 셸 토폴로지를 보이기 위한 표시 레이어이며, 해석 셸 레코드는 \`model.shells\`에 별도로 보존된다. 공식 입력이 잠긴 항목은 검증 보고서의 엔진 기능 모델 경계를 따른다.\n`;
  await writeFile(join(caseModelDir, `${id}_S-Structures_실제모델_R4_설명.md`), note, 'utf8');
  manifest.push({ id, title, folder, view, boundary, bookPath: captureModelPath, caseModelPath, counts: { nodes: model.nodes.length, members: model.members.length, shells: model.shells.length, links: model.links.length, loads: model.loads.length }, sha256: sha256(text) });
}
await writeFile(join(OUTPUT_ROOT, 'models', 'strix21-sstructures-ui-model-manifest-r4.json'), `${JSON.stringify({ schemaVersion: 'strix21-sstructures-ui-model-manifest-r4', generatedAt: '2026-08-30', cases: manifest }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ generated: manifest.length, outputRoot: OUTPUT_ROOT, cases: manifest.map((row) => ({ id: row.id, ...row.counts })) }, null, 2));
