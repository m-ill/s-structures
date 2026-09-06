/**
 * Compatibility facade for the historical verification import path.
 *
 * POLICY: Keep this path through Phase16 while external consumers migrate to
 * `src/nonlinear/qualification/nonlinearBenchmarks.js` (reviewBy: 'Phase16').
 * The canonical implementation must remain in the nonlinear qualification
 * layer so production nonlinear modules never depend on verification code.
 */
export * from '../../src/nonlinear/qualification/nonlinearBenchmarks.js';
