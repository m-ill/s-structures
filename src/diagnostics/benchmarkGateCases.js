import {
  createAxialBar,
  createCantileverGlobalYUdl,
  createCantileverTipLoad,
  createCantileverTriangularUdl,
  createCantileverUdl,
  createCustomFixedCantileverTipLoad,
  createFixedFixedUdl,
  createReleasedSimpleBeamUdl,
  createSimpleBeamCenterPoint,
  createSimpleBeamUdl,
} from '../examples/verification.js';

export const BENCHMARK_GATE_CASES = [
  ['B01', 'simple beam point', createSimpleBeamCenterPoint],
  ['B02', 'simple beam UDL', createSimpleBeamUdl],
  ['B03', 'cantilever tip', createCantileverTipLoad],
  ['B04', 'cantilever UDL', createCantileverUdl],
  ['B05', 'fixed fixed UDL', createFixedFixedUdl],
  ['B06', 'axial bar', createAxialBar],
  ['B07', 'custom fixed cantilever', createCustomFixedCantileverTipLoad],
  ['B08', 'global Y UDL', createCantileverGlobalYUdl],
  ['B09', 'triangular UDL', createCantileverTriangularUdl],
  ['B10', 'released simple beam', createReleasedSimpleBeamUdl],
];
