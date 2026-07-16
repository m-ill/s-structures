# Phase 9 Implementation Status

```yaml
reviewed_at: 2026-07-16
phase_status: implementation
documentation_status: baseline-complete
implementation_status: in-progress
compute_qualification: G2-kernel-qualified-local-profile
completed_milestones: [P9-M0, P9-M1, P9-M2, P9-M3, P9-M4, P9-M6, P9-M7]
implemented_milestones: [P9-M0, P9-M1, P9-M2, P9-M3, P9-M4, P9-M5, P9-M6, P9-M7, P9-M8]
active_milestone: P9-M9
next_milestone: P9-M9
release_status: not-qualified
design_transfer_allowed: false
```

## Current Decision

P9-M8 implementation is complete. Production Pushover and MDOF NLTH now share a versioned resident-session contract for accepted state commits, rejected-trial rollback, canonical checkpoints, bounded history transfer, CPU f64 residual/energy audits, and device-loss/OOM/cancel recovery. Focused Pushover, arc-length and NLTH regressions pass without changing the existing engineering result schemas.

Qualification remains `G2`. Production nonlinear GPU kernels remain shadow candidates only, automatic GPU routing remains disabled, and design transfer remains blocked. M-tier Pushover/NLTH performance, memory and browser UI budgets were not run under the user-requested minimal nonlinear test policy, so P9-M8 is listed as implemented but not qualification-complete. P9-M9 may proceed without claiming G4.

P9-M7 is complete for the production CPU f64 nonlinear element route. The equilibrium assembler now compiles versioned type/property SoA batches, reuses typed kinematic/force/tangent workspaces, reads committed state without per-element deep cloning, and scatters flat tangent blocks in a fixed deterministic order. The existing nonlinear result schema is unchanged.

Committed and trial element state now have a fixed-offset byte/numeric arena contract with owner isolation, commit and rejected-trial rollback byte parity. Current WebGPU frame and monotonic EPP fiber kernels are qualified only as G2 shadow candidates. Corotational, hinge-history and distributed-fiber production elements remain CPU f64, and explicit production GPU requests fail closed.

P9-M6 is complete for the production CPU f64 route. Modal/RSA and global buckling share a typed-CSC requested-mode eigen core, deterministic sign/order, MAC, original-operator residual audit, and Worker product service. Dense full eigen formation and duplicated modal/buckling Cholesky/Jacobi helpers are removed.

The optional GPU SpMV/block-vector route is not qualified or exposed. Existing frame and rigid-diaphragm assembly still originates in the legacy dense owner before CSC extraction. These limits are explicit and do not change M6 CPU completion.

P9-M5 implementation remains complete but its qualification gate remains blocked. Static elastic and Direct P-Delta have an explicit production-adapter WebGPU route using resident f32 SPD-PCG, original-system CPU f64 residual correction, and the existing CPU recovery, envelope, equilibrium and design path. Numeric parity, per-run design eligibility and GPU resource disposal pass on the recorded Chrome/NVIDIA Ampere profile.

Qualification remains `G2`. The 990-DOF end-to-end diagnostic measured CPU 684.10 ms versus GPU 1,131.70 ms, a 0.604 speedup against the required 1.2. The run also does not close the required five-sample S/M profile matrix. `auto` GPU remains disabled and global design transfer remains blocked.

M9 may proceed with product workflow migration, but M5 and M8 qualification blockers remain open.

## P9-M8 Results

| Area | P9-M8 result | Decision |
| --- | --- | --- |
| Gravity/session | canonical committed-state and checkpoint parity | PASS |
| Pushover | displacement/arc steps, hinge events and recovered results | PASS |
| MDOF NLTH | history, envelope, hinge transition and energy audit | PASS |
| State failure | reject/cancel/loss/OOM retains last committed checkpoint | PASS |
| Transfer integrity | bounded size and history/checkpoint hash validation | PASS |
| General solve | dynamic matrix class remains CPU f64 authoritative | PASS |
| Production GPU | history-dependent kernels not qualified | BLOCKED |
| M-tier budgets | time, memory, UI and cancel latency not run | BLOCKED |

## P9-M7 Results

| Area | P9-M7 result | Decision |
| --- | --- | --- |
| Element packaging | versioned type/property SoA with fixed offsets and bounded integrity hash | PASS |
| CPU element loop | f64 batch evaluation with reusable typed workspace | PASS |
| Result parity | force, tangent, state, energy and existing result schema | PASS |
| State isolation | separate committed/trial byte and numeric arenas | PASS |
| Rollback | rejected trial restores exact byte hash | PASS |
| Assembly | fixed element/local-row-major sparse reduction and hash | PASS |
| Hot-loop cleanup | committed-state deep clones reduced to zero | PASS |
| GPU partition | raw frame/fiber shadow candidates only; production types fail closed | PASS |
| Focused diagnostic | 128 elements with element/state/assembly stage accounting | PASS |
| Pushover/NLTH resident session | not part of M7 | DEFERRED TO M8 |

## P9-M6 Results

| Area | P9-M6 result | Decision |
| --- | --- | --- |
| K/M/Kg operator | symmetric typed CSC with matvec parity | PASS |
| Requested modes | shared shift-invert block subspace and bounded Rayleigh-Ritz | PASS |
| Canonicalization | sign/order/repeated-mode determinism and MAC | PASS |
| Modal/RSA | mass normalization, participation, SRSS/CQC and member recovery | PASS |
| Buckling | preload/eligibility retained; factors and mode residuals match | PASS |
| Failure policy | singular/mechanism/nonconvergence and GPU request fail closed | PASS |
| Product path | dedicated CPU f64 backend, Worker route and async service | PASS |
| M-tier diagnostic | 240 DOF, six modes, 12-vector projection, ~192 ms | PASS |
| Optional GPU eigen | not qualified or routed | DEFERRED |

## P9-M5 Results

| Area | P9-M5 result | Decision |
| --- | --- | --- |
| SPD eligibility | symmetry/scaling/conditioning/IC(0) checks | PASS |
| Mixed precision | GPU f32 solve plus CPU f64 residual/correction | PASS |
| Static elastic | combo/recovery/envelope/audit/design parity | PASS |
| Factor reuse | 1 matrix session, 2 RHS solves in focused fixture | PASS |
| Direct P-Delta | 11 tangent sessions, 0 invalid reuse | PASS |
| Failure policy | explicit failure terminal, no silent fallback | PASS |
| Resources | 38 GPU buffers created and destroyed | PASS |
| End-to-end performance | 0.604 speedup vs 1.2 threshold | FAIL |
| S/M profile matrix | local diagnostic only | BLOCKED |
| Auto GPU | disabled | PASS |

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
- M5 verification note: [P9_M5_HYBRID_ELASTIC.md](../verification/phase9/P9_M5_HYBRID_ELASTIC.md)
- M5 evidence: `reports/validation-evidence/phase9/p9-m5-hybrid-elastic.json`
- M5 raw browser evidence: `reports/validation-evidence/phase9/p9-m5-browser-raw.json`
- M5 code review: `reports/validation-evidence/phase9/p9-m5-code-review.md`
- M6 verification note: [P9_M6_SPARSE_EIGEN.md](../verification/phase9/P9_M6_SPARSE_EIGEN.md)
- M6 evidence: `reports/validation-evidence/phase9/p9-m6-sparse-eigen.json`
- M6 code review: `reports/validation-evidence/phase9/p9-m6-code-review.md`
- M7 verification note: [P9_M7_NONLINEAR_BATCH.md](../verification/phase9/P9_M7_NONLINEAR_BATCH.md)
- M7 evidence: `reports/validation-evidence/phase9/p9-m7-nonlinear-batch.json`
- M7 code review: `reports/validation-evidence/phase9/p9-m7-code-review.md`
- Evidence: `reports/validation-evidence/phase9/p9-m4-webgpu-foundation.json`
- Raw browser evidence: `reports/validation-evidence/phase9/p9-m4-browser-raw.json`
- Code review: `reports/validation-evidence/phase9/p9-m4-code-review.md`
- Release manifest: `docs/verification/phase9/release-manifest.json`
- Tests: `npm run test:p9 -- M4`
- Evidence generation: `npm run evidence:p9:m4`
- M5 evidence generation: `npm run evidence:p9:m5`
- M6 evidence generation: `npm run evidence:p9:m6`
- M7 evidence generation: `npm run evidence:p9:m7`
- M8 verification note: [P9_M8_HYBRID_NONLINEAR.md](../verification/phase9/P9_M8_HYBRID_NONLINEAR.md)
- M8 evidence: `reports/validation-evidence/phase9/p9-m8-hybrid-nonlinear.json`
- M8 code review: `reports/validation-evidence/phase9/p9-m8-code-review.md`
- M8 evidence generation: `npm run evidence:p9:m8`

## Remaining Boundaries

- M5 performance and S/M profile blockers must close before G3 Elastic-Candidate or automatic GPU routing.
- M6 CPU sparse dynamics is complete; optional eigen GPU acceleration remains unqualified.
- M8 CPU nonlinear resident integration is implemented; M-tier and production GPU qualification remain blocked.
- The external browser/vendor matrix must close `P9-GPU-PLT-12` before Phase 9 release.
- M9 must migrate existing production UI and Agent call sites to the product service; M3 supplies the service and forbids new synchronous production callers.
- Direct P-Delta tangent iterations remain intentionally isolated from linear-static factor reuse.
- M-tier individual detailed combination results are produced on demand, while the initial run returns bounded slices and the complete detailed envelope.
- External independent validation remains outside this milestone by user decision.

## Next Milestone

P9-M9: migrate product UI, Agent and API workflows to the shared compute service and expose truthful CPU/GPU capability, progress, cancel, retry and result provenance. M5 and M8 qualification debt remains open in parallel.
