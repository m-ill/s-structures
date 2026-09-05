# P9-M3 Code Review

## Scope

Reviewed elastic orchestration, factor grouping, shared-factor solve, Worker lifecycle, product API, sparse constraints, result retention, design recovery, compatibility boundaries, evidence and release state.

## Findings Resolved

### Critical: M-tier canonical constraints allocated dense identity and nullspace matrices

An uncoupled 9,126-DOF support system created multiple dense square transforms and exhausted practical memory before assembly. Large uncoupled constraints now use sparse rows and the expand/reduce APIs support that storage contract. Small and diaphragm fixtures retain the existing dense contract for compatibility.

### Critical: Retaining 30 detailed combination result graphs exceeded the 4 GiB heap

Each member result retained station forces, local displacements and three-component shape arrays. The production adapter now incrementally updates the final envelope, retains bounded combination slices for large runs and supports an on-demand detailed combination run. The complete M-tier run finishes without heap exhaustion.

### High: Material and section resolution scanned and normalized full catalogs per member

Canonical descriptors, assembly and design repeatedly resolved identical IDs. Run-scoped caches reduce this to one resolution per unique ID without changing catalog ownership or records.

### High: The common direct LDLT factor loop was not viable for 8,112 DOF

Large SPD systems now use a zero-fill incomplete Cholesky preconditioner and PCG with residual, pivot, curvature, iteration and cancellation gates. Small systems retain the deterministic direct factor. There is no silent dense fallback.

### High: Product elastic execution still depended on one synchronous call

The production adapter now executes combinations through Worker stages, reports monotonic progress, commits only completed combinations and discards partial current state on cancellation. The product service contains no `analyzeModel` call.

### Medium: Reusing stiffness risked reusing settlement and load vectors

The cache stores stiffness, constraints and free matrices only. Nodal loads, fixed-end loads, imposed spring forces, prescribed displacements, reactions and member recovery are rebuilt for each RHS.

### Medium: Direct P-Delta and unilateral active sets could share stale factors

Factor planning isolates Direct P-Delta combinations and unilateral combinations. Active member changes also alter component identity, forcing a new component factor.

### High: Sparse constraint storage broke two nonlinear consumers

Large uncoupled constraints intentionally omit the dense transform. Pushover lateral-pattern filtering and physical displacement control still read that transform directly. Both now consume canonical sparse row entries, and a 516-DOF regression fixture verifies both paths without running a long nonlinear analysis.

## Refactor Gates

- Staged prepare/solve/finalize elastic responsibilities: PASS.
- Production product service is asynchronous and Worker-only: PASS.
- Synchronous compatibility is S-tier, warned, expiring and unavailable to production UI/GPU: PASS.
- M-tier dense allocation and result-graph OOM paths removed: PASS.
- Factor/preconditioner count equals representative factor-group count: PASS.
- Recovery, envelope, design status and audit parity: PASS within published migration tolerances.
- Balanced factor resources after success and cancel: PASS.

## Residual Risk

- M-tier total time is 87.94 seconds. Result recovery and envelope materialization dominate after the first combination and remain targets for P9-M7 SoA/result-pipeline work.
- The published 1% force/member L2 tolerance is specific to migration from the older `1e-6` CG reference. Future CPU/GPU operation parity requires tighter dedicated tolerances.
- Large runs return detailed envelope data and bounded combination slices. Detailed station data for one combination requires an explicit on-demand run.
- Existing UI and Agent callers are not all migrated; P9-M9 owns that inventory and deletion gate.
- GPU, modal/RSA/buckling and nonlinear hybrid qualification remain unopened.

## Review Decision

No open Critical or High finding remains in the implemented P9-M3 scope. M3 is acceptable as a `G1` production-elastic CPU candidate with release and design-transfer gates closed.
