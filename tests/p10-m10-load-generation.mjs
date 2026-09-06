import assert from 'node:assert/strict';
import {
  buildFixedEndLoad,
  buildLoadDerivationTraceFromParts,
  buildMassSourceTrace,
  buildLoadsV2Trace,
  createModel,
  deriveWindStoryTransfers,
  generateSlabPanelLoads,
} from '../src/index.js';

const nodes = [
  { id: 'A', x: 0, y: 0, z: 3 },
  { id: 'B', x: 6, y: 0, z: 3 },
  { id: 'C', x: 6, y: 4, z: 3 },
  { id: 'D', x: 0, y: 4, z: 3 },
  { id: 'A0', x: 0, y: 0, z: 0 },
  { id: 'B0', x: 6, y: 0, z: 0 },
  { id: 'C0', x: 6, y: 4, z: 0 },
  { id: 'D0', x: 0, y: 4, z: 0 },
];
const members = [
  { id: 'AB', n1: 'A', n2: 'B' },
  { id: 'BC', n1: 'B', n2: 'C' },
  { id: 'CD', n1: 'C', n2: 'D' },
  { id: 'DA', n1: 'D', n2: 'A' },
];
const panelBase = { id: 'P', nodes: ['A', 'B', 'C', 'D'], load: 10, case: 'D', direction: '-z' };

const oneWay = generateSlabPanelLoads({ nodes, members, slabPanels: [{ ...panelBase, distribution: 'one-way', spanDirection: 'x' }] });
assert.equal(oneWay.loads.length, 2);
assert.ok(oneWay.loads.every((load) => load.type === 'udl'));
assert.ok(oneWay.loads.every((load) => ['BC', 'DA'].includes(load.member)));
assert.ok(oneWay.trace.summary.equilibriumError < 1e-10);
assert.equal(oneWay.trace.summary.totalPanelLoad, 240);

const twoWay = generateSlabPanelLoads({ nodes, members, slabPanels: [{ ...panelBase, distribution: 'two-way' }] });
assert.equal(twoWay.trace.panels[0].edgeTrace.filter((row) => row.shape === 'triangular').length, 2);
assert.equal(twoWay.trace.panels[0].edgeTrace.filter((row) => row.shape === 'trapezoidal').length, 2);
assert.ok(twoWay.trace.summary.equilibriumError < 1e-10);
assert.ok(Math.abs(twoWay.trace.summary.totalTransferredLoad - 240) < 1e-10);
assert.ok(twoWay.loads.every((load) => ['udl', 'trapezoid'].includes(load.type)));
const fixedEnd = buildFixedEndLoad(twoWay.loads[0], { L: 6, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
assert.equal(fixedEnd.ok, true);
assert.equal(fixedEnd.method, 'consistent-trapezoid-load');

const noBeam = generateSlabPanelLoads({ nodes, members: [], slabPanels: [{ ...panelBase, distribution: 'one-way' }] });
assert.ok(noBeam.loads.every((load) => load.type === 'nodal' && load.transferRecipient === 'direct-column'));
assert.ok(noBeam.trace.summary.equilibriumError < 1e-10);

const duplicate = { ...twoWay.loads[0], id: `${twoWay.loads[0].id}-COPY` };
const mass = buildMassSourceTrace({ nodes, members, loads: [...twoWay.loads, duplicate] }, {
  combos: [{ case: 'D', factor: 1 }],
  includeNodeMass: false,
});
assert.ok(Math.abs(mass.totalMass - 240 / 9.80665) < 1e-9);
assert.ok(mass.skipped.some((row) => row.reason === 'duplicate-generated-load'));

const wind = deriveWindStoryTransfers({ nodes, stories: [{ id: 'L1', z: 3 }] }, {
  pressure: 2,
  direction: 'x',
  leewardRatio: 0.4,
});
assert.equal(wind.planWidth, 4);
assert.equal(wind.rows[0].area, 12);
assert.equal(wind.rows[0].windward, 24);
assert.equal(wind.rows[0].leeward, -9.600000000000001);
assert.equal(wind.rows[0].tributaryWidthSource, 'model-geometry');

const derivation = buildLoadDerivationTraceFromParts({
  basis: {}, geometry: { size: {} }, storyDeadLoads: [], storyLiveLoads: [], storyLateralLoads: [],
  seismicSummary: { totalWeight: 0, baseShearX: 0, baseShearY: 0, denominator: 1 },
  storyMassSummary: null, slabTransfer: twoWay,
});
assert.equal(derivation.summary.slabDistributionRowCount, 5);
assert.equal(derivation.rows.find((row) => row.id === 'SLAB-P-TOTAL').result, 240);

const integratedModel = createModel({
  nodes,
  members,
  slabPanels: [{ ...panelBase, distribution: 'two-way' }],
  loadCases: [{ id: 'D', type: 'dead' }],
  stories: [{ id: 'L1', z: 3 }],
});
const integrated = buildLoadsV2Trace(integratedModel, {
  windPressure: 2,
  windDirection: 'x',
  leewardRatio: 0.4,
  massSource: { combos: [{ case: 'D', factor: 1 }], includeNodeMass: false },
});
assert.ok(Math.abs(integrated.slabTransfer.trace.summary.totalTransferredLoad - 240) < 1e-10);
assert.ok(Math.abs(integrated.massSource.totalMass - 240 / 9.80665) < 1e-9);
assert.equal(integrated.windTransfer.rows[0].leeward < 0, true);

export const M10_SNAPSHOT = Object.freeze({
  version: 'p10-m10-load-generation-v1',
  oneWayEquilibriumError: oneWay.trace.summary.equilibriumError,
  twoWayEquilibriumError: twoWay.trace.summary.equilibriumError,
  twoWayGeneratedLoadCount: twoWay.loads.length,
  fixedEndConsumed: fixedEnd.ok,
  fallbackRecipient: noBeam.loads[0].transferRecipient,
  slabMass: mass.totalMass,
  massDeduplicated: mass.skipped.some((row) => row.reason === 'duplicate-generated-load'),
  windward: wind.rows[0].windward,
  leeward: wind.rows[0].leeward,
  derivationRows: derivation.summary.slabDistributionRowCount,
});

console.log(JSON.stringify({ ok: true, ...M10_SNAPSHOT }, null, 2));
