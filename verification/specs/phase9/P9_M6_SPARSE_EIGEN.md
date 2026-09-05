# P9-M6 Sparse Modal, RSA and Buckling Verification

## Decision

P9-M6 is complete for the production CPU f64 route. Modal/RSA and global buckling now share a typed-CSC requested-mode eigen core. The solver factors the elastic stiffness once, applies a deterministic block subspace iteration to `K^-1 M` or `K^-1 Kg`, solves only the small Rayleigh-Ritz projection, and accepts modes using original-operator f64 residuals.

GPU SpMV and block-vector acceleration were optional for this milestone. They remain candidate operations only: no GPU eigen backend is qualified and `auto` or explicit GPU routing fails closed.

## Implemented Scope

- symmetric CSC operator contract for `K`, `M`, and `Kg`
- deterministic shift-invert block subspace iteration for requested modes only
- persistent CPU f64 sparse factor with multi-right-hand-side solves
- small projected symmetric Jacobi solve limited to at most 32 for the reference allowance
- canonical mode order and sign plus MAC/orthogonality audit
- implicit massless-DOF recovery without a dense Schur complement
- existing mass normalization, participation, SRSS/CQC, story, node, and member recovery retained
- existing buckling preload qualification and unsupported-domain guards retained
- production `modalRsa` and `globalBuckling` Worker operations and asynchronous service
- singular/mechanism, insufficient mode, nonconvergence, residual, and unqualified GPU diagnostics

## Verification Results

| Area | Result |
| --- | ---: |
| K/M/Kg sparse matvec parity | PASS |
| Requested eigenvalues | 2, 3, 4 reference values matched |
| Sign/order/repeated-mode determinism | PASS |
| MAC and mass normalization | PASS |
| SRSS/CQC and member recovery regression | PASS |
| Buckling factors and residuals | PASS |
| Singular residual-domain failure contract | PASS |
| Worker result-hash parity | PASS |
| GPU request fail-closed | PASS |
| Resource release | 0 active factor handles after solve |

## M-Tier Diagnostic

The retained end-to-end fixture is a 40-story cantilever frame with 240 active DOFs, 1,024 stiffness nonzeros, 80 mass nonzeros, and six requested modes. The recorded evidence run used a 12-vector projection and completed in approximately 192 ms against a 5,000 ms diagnostic budget. No full dense eigen matrix was allocated.

This is a local deterministic performance diagnostic, not an external application or vendor benchmark.

## Evidence

- governed evidence: `reports/validation-evidence/phase9/p9-m6-sparse-eigen.json`
- code review: `reports/validation-evidence/phase9/p9-m6-code-review.md`
- release manifest: `docs/verification/phase9/release-manifest.json`
- focused tests: `npm run test:p9 -- M6`
- evidence generation: `npm run evidence:p9:m6`

## Retained Boundaries

- Existing frame and rigid-diaphragm assembly still creates its structural matrix in the legacy dense owner before CSC extraction. M6 removes dense full eigen formation, not all upstream dense assembly.
- GPU eigen acceleration is not implemented as a production backend and cannot transfer design results.
- The synchronous numerical core observes a supplied cancellation signal between subspace iterations, but Worker message handling cannot interrupt an in-progress synchronous factorization.
- External independent validation remains deferred by project decision.
