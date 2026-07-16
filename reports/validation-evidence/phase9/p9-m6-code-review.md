# P9-M6 Code Review

## Decision

Critical findings: 0. High findings: 0. M6 is acceptable as the production CPU f64 modal/RSA/buckling eigen route. GPU eigen execution is not qualified and remains unavailable through the product service.

## Findings Resolved During Review

1. **Large-model coordinate seeds could miss a decoupled low-mode block.** Large requested-mode problems now use deterministic full-domain seed vectors with diagonal-ratio pivot emphasis. Small allowlisted problems retain a complete coordinate basis.
2. **Projection diagnostics reported the requested block size after numerical rank reduction.** The solver now records the actual final Rayleigh-Ritz projection dimension.
3. **Modal and buckling product operations did not propagate cancellation and iteration progress.** The adapter now passes the Worker signal into the common solver and maps subspace progress into the product progress range.
4. **The initial M-tier check used only a diagonal operator.** The retained performance evidence now runs a 40-story structural frame through assembly, mass generation, sparse extraction, factorization, requested modes, normalization, and recovery. The diagonal case remains a core eigenvalue reference only.
5. **Legacy dense eigen helpers remained duplicated between modal and buckling.** Separate Cholesky, inverse, transformed full matrix, and Jacobi implementations were removed. Both analyses use the same sparse eigen owner while keeping their structural recovery responsibilities separate.
6. **Singular modal residual domains could change the established user-facing failure reason.** Sparse stiffness qualification failures in a massless residual domain map to `RESIDUAL_DOF_BACK_SUBSTITUTION_FAILED`, preserving the previous fail-closed contract.

## Reviewed Boundaries

- `K`, `M`, and `Kg` are validated symmetric CSC operators at the eigen boundary.
- The elastic stiffness is factored once and reused for every block right-hand side.
- Full dense eigen matrices are forbidden; only the bounded projected symmetric problem is dense.
- Mode acceptance uses original `K*u-lambda*B*u` f64 residuals.
- Mode vectors are ordered by eigenvalue and oriented by a deterministic maximum-component rule.
- Modal vectors are physically mass-normalized after diaphragm expansion.
- RSA participation and SRSS/CQC node, story, and member recovery remain CPU f64.
- Buckling preload qualification, release compatibility, and unsupported-domain blocks are unchanged.
- Product execution uses dedicated Worker backend IDs; unqualified GPU requests fail explicitly.
- No licensed numerical dependency or third-party eigensolver was added.

## Residual Risks

- Structural assembly and rigid-diaphragm reduction still originate as dense matrices before sparse extraction.
- A synchronous sparse factorization cannot be interrupted by a cancellation message already waiting in the same Worker event queue; cancellation is observed before the solve and between subspace iterations.
- The local 240-DOF structural performance fixture does not replace independent application or cross-platform validation.
- Optional GPU SpMV/block-vector acceleration remains unimplemented and unqualified.

## Regression Policy

M6 focused tests plus Phase 5 analysis runners, Phase 6 RSA diaphragm/story, Phase 7 modal normalization/member recovery/buckling integrity, and Phase 9 Worker product contracts are required. Long nonlinear tests are not rerun; prior Phase 8 evidence is reused as directed.
