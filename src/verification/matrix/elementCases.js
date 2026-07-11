import {
  BENCH_INTERNAL,
  createAxialBar,
  createCantileverTipLoad,
  createCantileverUdl,
  createFixedFixedUdl,
  createSimpleBeamUdl,
} from '../../examples/verification.js';
import { buildFixedEndLoad, springSettlementLoad } from '../../loads/fixedEnd/index.js';
import { analyzeModel, localK12, memberAxes } from '../../solver/linear3d.js';

const SOURCE = 'closed-form elastic frame / exact fixed-end load formula';

export const VERIFICATION_ELEMENT_CASES = [
  {
    caseId: 'E01',
    tier: 'element',
    name: 'axial bar tip displacement',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const fixture = createAxialBar({ L: 3, P: 20 });
      const analysis = analyzeModel(fixture.model);
      const result = firstResult(analysis);
      return scalarResult(fixture, result?.disp?.N2?.[0], fixture.expected.tipUx, result, 'ux');
    },
  },
  {
    caseId: 'E02',
    tier: 'element',
    name: 'cantilever shear reaction',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const fixture = createCantileverTipLoad({ L: 4, P: 12 });
      const analysis = analyzeModel(fixture.model);
      const result = firstResult(analysis);
      return scalarResult(fixture, result?.reactions?.N1?.rz, fixture.expected.baseReactionZ, result, 'Rz');
    },
  },
  {
    caseId: 'E03',
    tier: 'element',
    name: 'cantilever UDL bending deflection',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const fixture = createCantileverUdl({ L: 4, w: 5 });
      const analysis = analyzeModel(fixture.model);
      const result = firstResult(analysis);
      return scalarResult(fixture, Math.abs(result?.disp?.N2?.[2] || 0), Math.abs(fixture.expected.tipUz), result, '|uz|');
    },
  },
  {
    caseId: 'E04',
    tier: 'element',
    name: 'local torsional stiffness',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const L = 5;
      const k = localK12(BENCH_INTERNAL.E, BENCH_INTERNAL.G, BENCH_INTERNAL.A, BENCH_INTERNAL.Iy, BENCH_INTERNAL.Iz, BENCH_INTERNAL.J, L);
      return {
        computed: k[3][3],
        reference: (BENCH_INTERNAL.G * BENCH_INTERNAL.J) / L,
        hashInput: { E: BENCH_INTERNAL.E, G: BENCH_INTERNAL.G, A: BENCH_INTERNAL.A, Iy: BENCH_INTERNAL.Iy, Iz: BENCH_INTERNAL.Iz, J: BENCH_INTERNAL.J, L },
        solverVersion: 'linear3d.localK12',
        metric: 'GJ/L',
      };
    },
  },
  {
    caseId: 'E05',
    tier: 'element',
    name: 'simple beam UDL maximum moment',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const fixture = createSimpleBeamUdl({ L: 6, w: 4 });
      const analysis = analyzeModel(fixture.model);
      const result = firstResult(analysis);
      return scalarResult(fixture, Math.abs(result?.memberResults?.M1?.Mzmax || 0), fixture.expected.maxMoment, result, '|Mz|max');
    },
  },
  {
    caseId: 'E06',
    tier: 'element',
    name: 'fixed-fixed UDL midspan deflection recovery',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const fixture = createFixedFixedUdl({ L: 4, w: 5 });
      const analysis = analyzeModel(fixture.model);
      const result = firstResult(analysis);
      return scalarResult(fixture, Math.abs(result?.memberResults?.M1?.dmaxM || 0), fixture.expected.midspanDeflection, result, 'dmax');
    },
  },
  {
    caseId: 'E07',
    tier: 'element',
    name: 'arbitrary point load fixed-end vector',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const L = 7;
      const P = 18;
      const r = 0.37;
      const ax = horizontalAxes(L);
      const contract = buildFixedEndLoad({ id: 'P1', type: 'point', member: 'M1', P, t: r, dir: '-z', case: 'D' }, ax);
      const shape = beamShapes(r, L);
      const qy = -P;
      return {
        computed: [contract.fe[1], contract.fe[5], contract.fe[7], contract.fe[11]],
        reference: shape.map((value) => value * qy),
        hashInput: { L, P, r, type: 'point-fixed-end' },
        solverVersion: contract.contractVersion,
        metric: 'local-y fixed-end vector',
      };
    },
  },
  {
    caseId: 'E08',
    tier: 'element',
    name: 'trapezoid load resultant preservation',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const L = 8;
      const load = { id: 'TR1', type: 'trapezoid', member: 'M1', w1: 2, w2: 6, from: 0.2, to: 0.85, dir: '-z', case: 'D' };
      const contract = buildFixedEndLoad(load, horizontalAxes(L));
      const total = -((load.w1 + load.w2) / 2) * (load.to - load.from) * L;
      return {
        computed: contract.fe[1] + contract.fe[7],
        reference: total,
        hashInput: { L, load },
        solverVersion: contract.contractVersion,
        metric: 'local-y load resultant',
      };
    },
  },
  {
    caseId: 'E09',
    tier: 'element',
    name: 'uniform temperature axial fixed-end force',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const L = 4;
      const material = { E: BENCH_INTERNAL.E, alpha: 1.2e-5 };
      const section = { A: BENCH_INTERNAL.A };
      const load = { id: 'TMP1', type: 'temperature', member: 'M1', dT: 25, case: 'D' };
      const contract = buildFixedEndLoad(load, horizontalAxes(L), { material, section });
      return {
        computed: Math.abs(contract.q0[0]),
        reference: material.E * section.A * material.alpha * load.dT,
        hashInput: { L, material, section, load },
        solverVersion: contract.contractVersion,
        metric: '|Nthermal|',
      };
    },
  },
  {
    caseId: 'E10',
    tier: 'element',
    name: 'spring support settlement load',
    toleranceKey: 'tolerance.element.max',
    referenceSource: SOURCE,
    run: () => {
      const node = { id: 'N1', spring: { kz: 5000 }, settlement: { uz: -0.003 } };
      const contract = springSettlementLoad(node);
      return {
        computed: contract.fe[2],
        reference: -15,
        hashInput: node,
        solverVersion: contract.version,
        metric: 'kz * settlement.uz',
      };
    },
  },
  {
    caseId: 'E11',
    tier: 'element',
    name: 'rolled local-axis orthonormality',
    toleranceKey: 'tolerance.element.max',
    referenceSource: 'vector algebra invariant',
    run: () => {
      const ax = memberAxes(
        { id: 'A', x: 1, y: -2, z: 0.5 },
        { id: 'B', x: 4, y: 2, z: 6 },
        { roll: 33, refVector: [0.2, 0.7, 1] },
      );
      const error = Math.max(
        Math.abs(norm(ax.x) - 1),
        Math.abs(norm(ax.y) - 1),
        Math.abs(norm(ax.z) - 1),
        Math.abs(dot(ax.x, ax.y)),
        Math.abs(dot(ax.x, ax.z)),
        Math.abs(dot(ax.y, ax.z)),
      );
      return {
        computed: error,
        reference: 0,
        errorScale: 1,
        hashInput: ax,
        solverVersion: 'linear3d.memberAxes',
        metric: 'max orthonormality error',
      };
    },
  },
];

function firstResult(analysis) {
  return analysis.byCombo?.D_ONLY || Object.values(analysis.byCombo || {})[0] || null;
}

function scalarResult(fixture, computed, reference, result, metric) {
  return {
    computed,
    reference,
    model: fixture.model,
    solverVersion: solverVersion(result),
    metric,
  };
}

function solverVersion(result) {
  return result?.solver?.version || result?.solver?.type || 'linear_static_3d_frame';
}

function horizontalAxes(L) {
  return memberAxes({ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: L, y: 0, z: 0 }, { roll: 0, strongAxis: 'z' });
}

function beamShapes(r, L) {
  const r2 = r * r;
  const r3 = r2 * r;
  return [
    1 - 3 * r2 + 2 * r3,
    L * (r - 2 * r2 + r3),
    3 * r2 - 2 * r3,
    L * (r3 - r2),
  ];
}

function dot(a, b) {
  return (Number(a?.[0]) || 0) * (Number(b?.[0]) || 0)
    + (Number(a?.[1]) || 0) * (Number(b?.[1]) || 0)
    + (Number(a?.[2]) || 0) * (Number(b?.[2]) || 0);
}

function norm(a) {
  return Math.hypot(Number(a?.[0]) || 0, Number(a?.[1]) || 0, Number(a?.[2]) || 0);
}
