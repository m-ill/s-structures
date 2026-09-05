# P8-M6 Code Review

- Review date: 2026-07-13
- Scope: Phase 7 section adaptation, steel/RC fiber mesh and materials, N-My-Mz response, PMM surface, concentrated-hinge coupling, Pushover integration
- Outcome: PASS with later-milestone performance and external-qualification limits

## Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| P0 | Legacy PMM silently created hard-coded `My=120/100/65` levels | Removed the implicit default; explicit levels or a member-derived/fiber surface are now required |
| P0 | Legacy PMM clamped axial ratios outside its declared domain | Replaced clamp behavior with coded failure or `blocked: true, clamped: false` surface evaluation |
| P0 | M4 PMM capacity was resolved once before equilibrium iterations | Current element `N, My, Mz` now updates the PMM capacity and trial hinge backbone inside every internal element iteration |
| P0 | PMM strength changes were absent from the internal condensation Jacobian | Added trial hinge sensitivities `dM/dN`, `dM/dMy`, and `dM/dMz` to the hinge residual gradient |
| P0 | Initial fiber mesh placed section depth on local z, conflicting with Phase 7 `Iz` strong-axis stiffness | Mapped section H/depth to local y and B/width to local z; fixed `Iy=int(z^2)dA`, `Iz=int(y^2)dA` and added cross-domain regression |
| P0 | A legacy static PMM hook and an M6 surface could reduce the same backbone twice | Fiber coupling now always scales the immutable base property; the legacy resolved property remains trace-only when a surface is active |
| P1 | Dynamic backbone hashes would invalidate committed cyclic state | Trial backbones retain the immutable base property hash while surface/source hashes are recorded separately |
| P1 | Phase 7 section and nonlinear section geometry could diverge | Fiber meshes consume the same `shape/params/properties` source snapshot and retain source, mesh, and surface hashes |
| P1 | Repeated analyses could rebuild identical PMM surfaces | Added material/section/reinforcement/options hash caching and explicit cache invalidation |
| P1 | Existing direct-property M5 fixtures have no geometry for fiber generation | Unsupported records are not guessed; they retain the M5 path with a structured warning, while supported-source generation failures block by default |
| P1 | Parametric geometry could omit fillets while retaining table A/I values | Production adaptation now blocks source-to-mesh A/I mismatch above 0.5% instead of mixing elastic and nonlinear sections |
| P1 | Removing implicit PMM levels broke reports for empty models | Empty/partial models now emit an explicit `review-required` PMM trace with `pmm-member-source-missing`; no hard-coded capacity is restored |
| P1 | Pure-axial capacity used a sampled maximum while bending used first material yield | Pure axial intercepts now use the same first strength-limit criterion with bracket refinement |
| P1 | PMM capacity selected the largest user-provided curvature sample | Capacity now requires a refined first material limit state or a resolved local peak; monotonic unresolved curves fail closed |
| P1 | Hinge coupling applied only a relative axial factor | The base B-point is scaled to the absolute section moment capacity in analysis units; the relative factor remains trace data only |
| P1 | Surface validation checked only My-Mz slices | Added axial-direction concavity checks from compression intercept through every internal level to tension intercept |
| P1 | Distributed fiber convergence existed only as a utility | Added a production-routed corotational distributed-fiber frame with Gauss section integration, state commit/rollback, and first-yield result recovery |
| P1 | Mechanical member fixed-end forces bypassed distributed fiber strain | Full elastic station resultants, including fixed-end actions, are converted to section strains before fiber integration |
| P1 | Distributed-fiber post-yield tangent omitted the deformation/current-axis derivative | The full global fiber correction force is centrally differentiated from the same committed state; the plastic finite-difference regression error is below `1e-6` in analysis units |
| P1 | RC pure-tension scan stopped exactly at the rebar elastic boundary | Exact steel yield/concrete peak checks, separate absolute/relative axial tolerances, refined curvature stepping, and tangent-guided moment-ray correction now produce the 400x600 RC PMM surface |
| P1 | PMM cache omitted numerical options | The cache identity now includes all mesh, material, axial solve, direction, capacity, and tolerance options; `directionIterations=1` and `7` produce distinct surfaces |
| P1 | Distributed yielding was absent from mechanism termination | Synthetic `${memberId}:distributed` plastic IDs now participate in both runtime termination and recovered mechanism events |

## Reviewed Boundaries

- Fiber coordinates and areas use SI geometry; local y follows section H/depth and local z follows B/width, so `Iy=int(z^2)dA` and `Iz=int(y^2)dA` match the Phase 7 frame convention. Constitutive stress and tangent use Pa. The Pushover adapter explicitly converts analysis `kN` and `kN-m` demands to section `N` and `N-m`.
- Section generalized strain is `[epsilon0, kappaY, kappaZ]` and generalized force is `[N, My, Mz]`, with tension-positive axial force.
- Steel H/BOX/PIPE and RC RECT/SQUARE meshes are supported. RC generation requires an explicit reinforcement snapshot; unsupported or incomplete geometry is never inferred.
- Material and section trial operations are pure. Commit and rollback return hashed serializable state snapshots.
- PMM surface validation checks signs, axial bounds, angular ordering, full P-My-Mz convexity, node coordinates, and source/content hashes before evaluation.
- Concentrated hinge coupling uses absolute section-derived radial capacity. `distributed-plasticity` members are routed to the fiber frame and are not silently replaced by an elastic or concentrated-hinge element.
- Distributed-fiber material force is evaluated from total elastic station resultants and the global correction tangent is centrally differentiated, including current-axis and deformation-map effects.
- First generation of a unique RC PMM surface is computationally expensive in the current single-thread JavaScript runtime. Cached repeats are separated correctly; Worker execution and persisted caches remain P8-M10/M11 work.

## Deferred By Design

- First-time PMM surface generation for many unique sections is computationally significant. Hash caching is active; Worker progress UI, persisted project caches, and large-model budgets remain P8-M10/M11 work.
- Post-peak arc-length and cyclic static continuation remain P8-M7.
- MDOF nonlinear time history remains P8-M8.
- External solver correlation, published full-curve qualification, and pilot acceptance remain P8-M11. Therefore the production Pushover capability stays `candidate` and design transfer remains blocked.
