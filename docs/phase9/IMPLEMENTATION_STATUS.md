# Phase 9 Implementation Status

```yaml
reviewed_at: 2026-07-15
phase_status: implementation
documentation_status: baseline-complete
implementation_status: in-progress
compute_qualification: G2-kernel-qualified-local-profile
completed_milestones: [P9-M0, P9-M1, P9-M2, P9-M3, P9-M4]
active_milestone: none
next_milestone: P9-M5
release_status: not-qualified
design_transfer_allowed: false
```

## Current Decision

P9-M4 is implemented and passes the local primary-profile WebGPU kernel gate. Seven independent f32 kernels compile and execute on the recorded Chrome/NVIDIA Ampere profile, match the CPU f32 references, repeat deterministically and dispose all GPU resources.

Qualification advances to `G2` for independent kernels only. WebGPU is not connected to the production analysis Worker and cannot transfer analysis, envelope, design or report values. `P9-GPU-PLT-12` remains deferred for the external cross-vendor/browser matrix.

The measured raw fixtures are transfer-bound and slower than CPU, so `auto` correctly remains on CPU. M5 must demonstrate resident-buffer reuse, CPU f64 audit and end-to-end elastic benefit before a production GPU route can be considered.

## P9-M4 Results

| Area | P9-M4 result | Decision |
| --- | --- | --- |
| WebGPU platform | capability/limit preflight, error scopes, queue wait and loss state | PASS |
| Resources | bounded pool, segmentation, staging/readback; 34 created/34 destroyed | PASS |
| Numeric kernels | vector, reduction, CSR, Jacobi, fiber and frame; 7/7 browser parity | PASS |
| Determinism | five reduction runs, one result hash | PASS |
| Routing | explicit GPU provenance; small auto route remains CPU | PASS |
| Architecture | WebGPU API and shader owner confined to compute backend | PASS |
| Performance truth | transfer-inclusive GPU slower on both raw fixtures | RECORDED |
| Browser/vendor matrix | local NVIDIA profile passed; remaining required profiles external | DEFERRED |
| Design transfer | blocked | PASS |

## P9-M3 Retained Results

| Area | P9-M3 result | Decision |
| --- | --- | --- |
| Orchestration | validation, preparation, combination solve and finalization are explicit stages | PASS |
| Factor groups | settlement is RHS-only; unilateral and Direct P-Delta groups invalidate safely | PASS |
| Multi-RHS | S: 1 factor/10 solves; M: 1 IC(0)/30 solves with 29 reuses | PASS |
| Worker lifecycle | monotonic progress, committed-boundary cancel and no partial-current result | PASS |
| Product boundary | asynchronous service plus on-demand detailed-combination run | PASS |
| Sync compatibility | S-tier warning only; production UI and GPU routing forbidden | PASS |
| Sparse constraints | large uncoupled supports use sparse rows instead of dense identity/nullspace | PASS |
| Result memory | M-tier uses incremental envelope and bounded slices; no 4 GiB heap failure | PASS |
| S performance | 1,955.43 ms vs 3,187.74 ms reference, ratio 0.613 | PASS |
| M performance | 8,112 active DOF, 8,456 members, 30 combinations, 87,942.67 ms | PASS |
| Resource lifecycle | factor peak 1,090,976 bytes and balanced disposal | PASS |

## Numerical Migration

The old S-tier path used a `1e-6` Jacobi-CG stopping criterion while the production path uses a reusable direct factor for S-tier and IC(0)-PCG for M-tier. Displacement relative L2 error is `8.78e-7`; force/member relative L2 is `0.00644` with `0.7001 kN` absolute maximum. The migration gate is therefore explicitly `1%` relative L2 and `1.0 kN` absolute for force/member channels. Design maximum ratio, statuses, combination IDs, envelope source IDs and audit status are unchanged. This migration tolerance is not the future CPU/GPU kernel parity tolerance.

## Artifacts

- Verification note: [P9_M4_WEBGPU_FOUNDATION.md](../verification/phase9/P9_M4_WEBGPU_FOUNDATION.md)
- Evidence: `reports/validation-evidence/phase9/p9-m4-webgpu-foundation.json`
- Raw browser evidence: `reports/validation-evidence/phase9/p9-m4-browser-raw.json`
- Code review: `reports/validation-evidence/phase9/p9-m4-code-review.md`
- Release manifest: `docs/verification/phase9/release-manifest.json`
- Tests: `npm run test:p9 -- M4`
- Evidence generation: `npm run evidence:p9:m4`

## Remaining Boundaries

- M5-M8 must qualify hybrid elastic, dynamics and nonlinear GPU routes.
- The external browser/vendor matrix must close `P9-GPU-PLT-12` before Phase 9 release.
- M9 must migrate existing production UI and Agent call sites to the product service; M3 supplies the service and forbids new synchronous production callers.
- Direct P-Delta tangent iterations remain intentionally isolated from linear-static factor reuse.
- M-tier individual detailed combination results are produced on demand, while the initial run returns bounded slices and the complete detailed envelope.
- External independent validation remains outside this milestone by user decision.

## Next Milestone

P9-M5: hybrid elastic static and Direct P-Delta with CPU f64 residual/audit and fail-closed design transfer.
