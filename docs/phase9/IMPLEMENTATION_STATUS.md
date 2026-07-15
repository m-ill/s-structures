# Phase 9 Implementation Status

```yaml
reviewed_at: 2026-07-15
phase_status: implementation
documentation_status: baseline-complete
implementation_status: in-progress
compute_qualification: G1-candidate
completed_milestones: [P9-M0, P9-M1, P9-M2, P9-M3]
active_milestone: none
next_milestone: P9-M4
release_status: not-qualified
design_transfer_allowed: false
```

## Current Decision

P9-M3 is implemented and passes its focused gate. Production elastic static analysis now runs through the common asynchronous Worker, groups combinations by stiffness identity, assembles stiffness once per group, reuses one direct factor or IC(0) preconditioner across RHS channels, and preserves recovery, envelope, design, equilibrium and audit states.

The M-tier fixture now completes instead of being blocked by a dense constraint contract or exhausting the JavaScript heap. Large runs retain a final detailed envelope and bounded combination slices; a selected combination can be rerun through `runCombination` for detailed station results. Small runs retain every detailed combination.

Qualification remains `G1` candidate. M3 qualifies production CPU elastic execution, not GPU execution or final design transfer.

## Milestone Results

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

- Verification note: [P9_M3_ELASTIC_RUNTIME.md](../verification/phase9/P9_M3_ELASTIC_RUNTIME.md)
- Evidence: `reports/validation-evidence/phase9/p9-m3-elastic-runtime.json`
- Code review: `reports/validation-evidence/phase9/p9-m3-code-review.md`
- Release manifest: `docs/verification/phase9/release-manifest.json`
- Tests: `npm run test:p9 -- M3`
- Evidence generation: `npm run evidence:p9:m3`

## Remaining Boundaries

- M4-M8 must implement and qualify WebGPU platform, kernels and hybrid elastic/nonlinear routes.
- M9 must migrate existing production UI and Agent call sites to the product service; M3 supplies the service and forbids new synchronous production callers.
- Direct P-Delta tangent iterations remain intentionally isolated from linear-static factor reuse.
- M-tier individual detailed combination results are produced on demand, while the initial run returns bounded slices and the complete detailed envelope.
- External independent validation remains outside this milestone by user decision.

## Next Milestone

P9-M4: WebGPU platform lifecycle, resource containment and independent batch kernels without design-result transfer.
