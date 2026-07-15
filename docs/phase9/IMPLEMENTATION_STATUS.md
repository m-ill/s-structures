# Phase 9 Implementation Status

```yaml
reviewed_at: 2026-07-15
phase_status: implementation
documentation_status: baseline-complete
implementation_status: in-progress
compute_qualification: G1-candidate
completed_milestones: [P9-M0, P9-M1, P9-M2]
active_milestone: none
next_milestone: P9-M3
release_status: not-qualified
design_transfer_allowed: false
```

## Current Decision

P9-M2 is implemented and verified. Typed CSR/CSC storage, sparse matrix operations, symbolic analysis, SPD LDLT, general/indefinite partial-pivot LU, reduced assembly, factor lifecycle, CPU backend, and WASM backend ownership now reside under `src/compute`. The Phase 8 public paths remain as compatibility facades.

The Rust module preserves the Phase 8 ABI and adds the Phase 9 ABI v2 multi-RHS export. CPU and WASM paths are deterministic `f64`, fail closed on unsupported input, report no dense allocation or fallback, and close their allocation ledgers after execution.

Qualification remains `G1` candidate. M2 qualifies the sparse kernel/runtime layer; it does not yet migrate the full elastic analysis orchestration or qualify GPU execution.

## Milestone Results

| Area | P9-M2 result | Decision |
| --- | --- | --- |
| Sparse ownership | One implementation owner in `src/compute/sparse`; six legacy paths reduced to facades | PASS |
| Typed storage | Canonical CSR/CSC creation, conversion, validation, hashes, matvec and diagnostics | PASS |
| SPD solve | Sparse LDLT factor handle, positive-pivot qualification, residual checks | PASS |
| General solve | Sparse row-map LU with partial pivoting, singular detection and no dense fallback | PASS |
| Lifecycle | Symbolic and numeric reuse, value-hash invalidation, release/dispose balance | PASS |
| Multi-RHS | One prepared factor on CPU; native WASM ABI v2 channel execution with deterministic order | PASS |
| Failure containment | Cancel, memory budget, missing backend, singular and nonfinite inputs fail closed | PASS |
| Capabilities | SIMD and threads are explicit disabled capabilities, not implied acceleration | PASS |
| Compatibility | Phase 7 sparse integrity and focused Phase 8 assembly/dynamics/WASM checks | PASS |
| Scale proxy | 1,200-DOF banded sparse solve stays below the 64 MiB test budget with no dense allocation | PASS |

## Artifacts

- Verification note: [P9_M2_CPU_WASM.md](../verification/phase9/P9_M2_CPU_WASM.md)
- Evidence: `reports/validation-evidence/phase9/p9-m2-cpu-wasm.json`
- Code review: `reports/validation-evidence/phase9/p9-m2-code-review.md`
- Release manifest: `docs/verification/phase9/release-manifest.json`
- Tests: `npm run test:p9 -- M2`
- Evidence generation: `npm run evidence:p9:m2`

## Remaining Boundaries

- M3 must route production elastic analysis through the common asynchronous runtime and group load combinations by reusable stiffness/factor identity.
- The WASM v2 ABI shares matrix transfer across RHS channels; long-lived native factor handles across separate calls are not a public ABI. The common CPU factor runtime owns persistent numeric handles in M2, and M3 owns production factor-group reuse.
- M4-M8 must implement and qualify GPU kernels. SIMD and WASM threads remain disabled until a dedicated capability and determinism gate is passed.
- M9 must migrate production UI/agent callers. M10 must close final release and cleanup gates.

## Next Milestone

P9-M3: elastic execution plan, stiffness/factor groups, production multi-combination RHS solve, recovery/design parity, and asynchronous job integration.
