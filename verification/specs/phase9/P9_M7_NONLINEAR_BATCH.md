# P9-M7 Nonlinear SoA Batch Verification

## Decision

P9-M7 is complete for the production CPU f64 nonlinear element evaluation path. The milestone does not qualify production WebGPU nonlinear analysis and does not permit GPU output to enter design results.

## Implemented Contracts

- `p9-m7-nonlinear-soa-batch-v1`: deterministic type/property groups, integer type/group codes, flattened DOFs, tangent offsets, bounded SHA-256 identity.
- `p9-m7-cpu-nonlinear-batch-f64-v1`: reusable f64 kinematic, force and tangent workspaces with one batch-boundary state integrity check.
- `p9-m7-nonlinear-batch-state-arena-v1`: fixed element byte/numeric slots with separate committed and trial storage, owner checks, commit and rollback.
- `p9-m7-deterministic-nonlinear-assembly-v1`: flat tangent scatter in element-index and local row-major order.
- `p9-m7-nonlinear-batch-capability-v1`: exact CPU/GPU and matrix-class partition.
- `p9-m7-nonlinear-gpu-shadow-candidate-v1`: CPU-f32 parity gate for the existing independent raw WebGPU frame/fiber kernels.

## Production Route

`createEquilibriumAssembler` compiles the existing nonlinear element contracts into the SoA batch once. Each equilibrium evaluation gathers displacements into reusable typed storage, invokes the authoritative element formulation, records a separate trial state, and assembles flat tangent values directly into the existing reduced CSC pattern. Public equilibrium, Pushover and NLTH result shapes are unchanged.

Corotational frames/trusses, concentrated hinges and distributed-fiber elements are production-qualified only on CPU f64. The independent WebGPU `frameMatrixBatch` and `fiberSampleBatch` operations remain G2 shadow candidates, use f32, and are blocked for production and design transfer.

## Verification

| IDs | Coverage | Result |
| --- | --- | --- |
| `P9-GPU-NL-01~02` | object kernel versus CPU SoA force/tangent/state/energy | PASS |
| `P9-GPU-NL-03~04` | committed/trial commit and rejected-trial byte parity | PASS |
| `P9-GPU-NL-05~06` | WebGPU shadow numeric/state/diagnostic gate | PASS |
| `P9-GPU-NL-07~08` | CSC values and deterministic reduction hash | PASS |
| `P9-GPU-NL-09~10` | production GPU and general-matrix fail-closed partition | PASS |
| `P9-REF-07~09` | unchanged result schema, hot-loop clone removal, scoped ownership | PASS |
| `P9-PERF-12` | element/state/assembly stage accounting on 128-element fixture | PASS |

Focused Phase 8 regressions for MDOF Newton, hinged frame and distributed-fiber frame also pass. Long nonlinear end-to-end suites were intentionally not rerun under the user-approved minimal nonlinear test policy.

## Retained Boundaries

- Production WebGPU nonlinear element evaluation is not qualified.
- M7 does not keep a Pushover or NLTH state session resident on GPU; that is P9-M8.
- The current JS element formulations still execute sequentially inside each deterministic batch.
- Fixed byte slots fail closed on state growth instead of reallocating during an active analysis.
- External independent validation is deferred by user decision.

## Evidence

- Evidence: `reports/validation-evidence/phase9/p9-m7-nonlinear-batch.json`
- Review: `reports/validation-evidence/phase9/p9-m7-code-review.md`
- Generate: `npm run evidence:p9:m7`
- Verify: `npm run test:p9 -- M7`
