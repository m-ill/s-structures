# ADR-008: Newmark, Damping, and Dynamic Substep Policy

- Status: Accepted for P8-M8 candidate scope
- Date: 2026-07-14
- Decision owners: Phase 8 nonlinear solver maintainers
- Applies to: `p8-production-mdof-nlth`

## Context

The legacy NLTH path integrates one scalar mass and bilinear spring and is not bound to the 3D model. P8-M8 requires the dynamic solver to consume the same canonical domain, gravity-preloaded committed state, corotational elements, concentrated hinges, and qualified distributed-fiber states used by production nonlinear static analysis.

The production path must also make time integration, damping, failed-step state handling, output retention, and backend selection explicit. A result is invalid if a failed trial modifies committed element history, if a coarse failed step is merely reported without reintegration, or if a restart silently changes its mass, damping, record, or model domain.

## Decision

### Coordinates and excitation

- Dynamic unknowns are relative reduced coordinates `q` under the canonical affine constraint.
- Uniform support acceleration uses `P_g(t) = -T^T M l a_g(t)` for one to three simultaneous components.
- P8-M8 accepts explicit acceleration units, sign, baseline policy, scale, and optional target PGA. It does not claim spectrum matching.
- Spatially varying support motion is outside this milestone and is rejected rather than reduced to uniform excitation.

### Mass and damping

- `M` is assembled from the selected Phase 7 `massSourceId` and its ownership snapshot. Lumped and consistent frame mass are separate explicit formulations.
- Constraint reduction is `M_r = T^T M T`. Translational and rotational nodal inertia are retained; generated or massless ownership is not silently duplicated.
- Consistent mass with released member ends is blocked until release mass condensation is qualified.
- Rayleigh damping assembles the actual matrix `C = alpha M + beta K_ref`. `K_ref` is explicitly `initial` or gravity-`committed` tangent stiffness.
- A nonsymmetric damping matrix, negative diagonal outside tolerance, or negative accepted-step damping power fails closed. Energy accounting does not hide negative damping by taking an absolute value.

### Time integration and equilibrium

- The only qualified P8-M8 integrator is Newmark average acceleration with `beta=0.25` and `gamma=0.5`.
- Every time step performs full MDOF Newton equilibrium on
  `R_d = P_static + P_g - P_int(q) - M a(q) - C v(q)`.
- The correction matrix is `K_eff = K_t + a0 M + a1 C`; line search reevaluates the current element trial response.
- Stateful concentrated-hinge and distributed-fiber dynamic tangents use the general matrix backend. Elastic conservative frames may use the SPD backend when the assembler contract permits it.
- Production execution uses the in-house sparse backend contract. Dense pivoted execution is limited to small verification models.

### Commit, rollback, and substeps

- Element and global states remain immutable committed/trial records. Only a converged time step is committed.
- A rejected step must restore the byte-equivalent committed state and is reintegrated as two half steps. The original failed result is never continued.
- Binary subdivision stops at explicit `minDt`, maximum level, cancellation, or internal-step limit.
- Each accepted internal step is a commit boundary. If a later substep fails, the run returns the last accepted committed state and a restartable checkpoint instead of reverting the whole output interval.
- Restart validates domain identity, mass hash, damping hash, ground-motion set hash, vector dimensions, element state, and current dynamic equilibrium. It does not reclassify a valid dynamic checkpoint as a static initial state.

### Results and runtime

- Output sample times and accepted internal substeps are separate counters.
- Output history includes reduced `q/v/a`, ground acceleration, 6DOF inertia base reaction, member forces, hinge/fiber state, convergence, and energy.
- Chunk manifests, nested numeric envelope paths, checkpoints, retention policy, memory budget, and bounded accepted/rejected step trace are part of the result contract.
- Worker execution emits progress, result chunks, checkpoints, and a commit boundary for every accepted internal step.
- GPU remains an opt-in future backend. No GPU acceleration is reported unless a deterministic float64 qualified backend is explicitly supplied; no silent CPU fallback is allowed for a GPU request.

## Consequences

- P8-M8 removes scalar default mass/stiffness from the production route and makes model/domain/mass/element counts auditable in the run record.
- Hardening hinges may use a general solve even when their backbone tangent is positive. This is a correctness-first choice for state-dependent condensed tangents and can cost factorization time.
- The average-acceleration method is unconditionally stable only for the linear problem; nonlinear accuracy and convergence still require time-step sensitivity checks and substep limits.
- A completed M8 run remains `candidate` and `designBlocked`. External commercial-solver comparison, representative-building performance, full Phase 7 feature integration, and pilot acceptance remain P8-M9 through P8-M11 gates.

## Revisit Conditions

Revisit this ADR before adding generalized-alpha/HHT integration, modal damping, spatial support excitation, released-member consistent mass, GPU sparse kernels, or automatic nonlinear time-step error control. Each change requires new verification IDs and may not reuse the M8 qualification by implication.
