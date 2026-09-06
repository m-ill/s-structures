# P9-M5 Code Review

## Decision

Critical findings: 0. High findings: 0. The explicit mixed-precision implementation is acceptable for diagnostic use. G3 Elastic-Candidate qualification is not granted because the local end-to-end speed threshold and S/M profile matrix did not pass.

## Findings Resolved During Review

1. **Auto planning always preferred CPU even for an approved profile.** The product service now restricts the candidate set using the same profile predicate as the production adapter. The plan retains `userPolicy: auto`, and only a qualified profile can select the hybrid backend.
2. **Auto eligibility did not reject unilateral members.** The shared predicate now blocks tension-only and compression-only active-set models, and Direct P-Delta additionally requires its own profile approval.
3. **Backend execution overwrote an auto request.** A selected backend now preserves `computeTarget: auto`, allowing the production adapter to verify the profile again instead of recording an explicit target incorrectly.
4. **Direct P-Delta failure accounting could collapse repeated errors to one.** Each failed tangent request is now counted exactly once, including session creation and recovery exceptions, and the trace marks completion rather than trusting a partial GPU result.
5. **Mixed-precision errors exposed oversized matrix details.** Failure diagnostics retain stable reason codes and bounded eligibility summaries without embedding full matrices.
6. **Capture initially repeated structural assembly during recovery.** The capture contract now carries an internal continuation that reuses the assembled component state and invokes the existing f64 recovery path directly.
7. **Backend provenance overstated qualification and could drift from the plan.** The hybrid descriptor now states G2 implementation status, and backend execution binds the planned target separately from the requested `auto` policy. A mismatched backend ID fails with `ANALYSIS_BACKEND_ROUTE_MISMATCH`.

## Reviewed Boundaries

- CPU f64 remains the canonical assembly, residual, recovery, envelope, equilibrium and design authority.
- GPU f32 values cannot transfer to design unless the original-system f64 residual and load-relative residual pass.
- Static factor groups reuse one resident matrix session across right-hand sides.
- Direct P-Delta invalidates the GPU matrix session whenever the tangent changes.
- Explicit GPU failure is terminal; no silent CPU reroute exists.
- Worker and product service route through the same production adapter IDs.
- All browser GPU buffers are destroyed after the test run.
- No licensed numerical dependency or third-party solver was added.

## Residual Risks

- Jacobi-PCG is not competitive with the current CPU factor path on the measured structural fixture.
- The browser benchmark retained three diagnostic samples rather than the five required for final qualification.
- M-tier elastic end-to-end and required cross-vendor/browser profiles remain unqualified.
- The independent frame-matrix GPU kernel is not used as a production design input.
- Physical device loss and driver reset remain part of the external hardware matrix.

## Regression Policy

M5 focused elastic, Direct P-Delta and mixed-precision tests plus nearby M3-M4 and P6-P8 Direct P-Delta contracts are required. Long nonlinear suites are not rerun; their Phase 8 qualified evidence is reused as directed.
