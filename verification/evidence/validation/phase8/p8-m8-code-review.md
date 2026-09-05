# P8-M8 Code Review

- Review date: 2026-07-14
- Scope: model mass, ground motion, Rayleigh damping, MDOF Newmark/full Newton, substep state handling, production NLTH routing, Worker streaming, result history and restart
- Outcome: PASS for M8 candidate scope; external correlation and representative-building performance remain gated

## Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| P0 | Legacy NLTH discarded the model and accepted scalar mass/stiffness defaults | Added an explicit `p8-production-mdof-nlth` route bound to canonical domain, Phase 7 mass source, gravity state, 3D elements and immutable run record; legacy SDOF remains isolated |
| P0 | A failed continuation inside one output interval could discard already accepted substep state while commit callbacks had observed it | Failure propagation now carries the last accepted state/evaluation; final checkpoint, state hash and commit boundary all end at the same accepted time |
| P0 | A history sink or commit callback failure after a converged internal step could finalize the preceding state | The execution owner now advances to the accepted immutable state before sink notification; sink failures return a structured failure and final checkpoint at that accepted boundary |
| P0 | Dynamic restart reran static-initial equilibrium validation and rejected valid nonzero dynamic states | Restart now validates domain and mass/damping/record provenance plus the current dynamic residual, preserving checkpoint `q/v/a` and element states |
| P0 | Stateful condensed hinge tangents could be sent to an unsafe SPD solve | Concentrated-hinge and distributed-fiber dynamic paths are promoted to the general matrix backend; the selection reason is retained in result provenance |
| P1 | Lumped mass-source assembly dropped explicit nodal rotational inertia | Rotational nodal masses are added once beside the translational mass-source trace and verified on a 6DOF column |
| P1 | Dynamic base moment omitted nodal rotational inertia moments | Base recovery now includes both `r x F_inertia` and rotational inertia components from the full 6DOF mass matrix |
| P1 | Distributed-fiber output recovery treated named section vectors as arrays and stored empty strain/force histories | Recovery now normalizes both `{epsilon0,kappaY,kappaZ}`/`{N,My,Mz}` and array forms; a dynamic distributed-fiber frame verifies committed integration-point history |
| P1 | Response envelopes indexed only top-level numeric arrays | History now recursively indexes member force, hinge, fiber, energy and convergence numeric paths while retaining the existing `q[i]` keys |
| P1 | Accepted/rejected diagnostic arrays grew without a bound even when response history had a memory budget | Added bounded step-trace retention with separate total and retained counts plus explicit truncation metadata |
| P1 | `retainInternalSteps` normalized rows but did not retain them | Internal rows are now retained in the manifest under the same memory budget when explicitly enabled |
| P1 | Energy-audit exceptions could escape the step without a structured rollback result | Accepted energy calculation is guarded before commit; failures return through the ordinary rollback path |
| P1 | Negative damping power was clamped to zero and could hide an indefinite damping matrix | Damping assembly checks symmetry/diagonal sign and accepted-step energy fails closed on negative damping power outside tolerance |
| P1 | Production result could bind an old domain to a model mutated during gravity or dynamic execution | Model hashes are rechecked after gravity preload and after NLTH completion before the run record is built |
| P1 | CSC validation accepted unsorted or out-of-range rows and non-finite values | Added strict public CSC pointer, row-order, bounds and finite-value validation |
| P1 | Typed-array values in a ground-motion record or retained nested result could be mutated after hashing | Record hashes are revalidated into an execution-private snapshot, and retained nested result objects are recursively frozen |
| P2 | Large typed arrays used spread-based extrema in mass/damping checks | Replaced spread calls with bounded reductions to avoid argument-limit failures on large models |
| P2 | Analysis Runner and Agent manifest did not summarize or advertise the production MDOF result | Added M8 versions, result summary fields, capability modules, candidate milestone status and truthful GPU limitation |

## Reviewed Boundaries

- Mass ownership comes from the selected Phase 7 `massSourceId`; generated/massless descriptors are excluded from physical member mass. Lumped and consistent formulations are explicit and released-member consistent mass fails closed.
- Ground motion requires explicit acceleration units and supports one to three simultaneous uniform components with common `dt` and point count. Baseline correction and PGA scaling are recorded; spectrum matching is always false in this path.
- The dynamic residual is `Pstatic + Pg - Pint - Ma - Cv`. The effective correction matrix is `Kt + a0M + a1C`, and each line-search candidate reevaluates current trial element states.
- Newmark `beta=0.25`, `gamma=0.5` is the only M8-qualified integrator. Nonlinear stability is not inferred from the linear unconditional-stability property; time-step convergence and minimum-step termination are explicit.
- Every accepted internal step is committed. Rejected trial state is byte-equivalent to the incoming committed state and is actually reintegrated as half steps.
- Initial and restart paths are distinct. Initial execution requires gravity static equilibrium; restart requires matching dynamic provenance and dynamic equilibrium at checkpoint time.
- Output steps and internal substeps have independent counts. Worker progress carries result chunks and checkpoints, while each accepted internal step creates a commit boundary.
- History includes node kinematics, input acceleration, inertia base reactions, local member force, hinge/fiber state, energy and convergence. Nested numeric envelope paths and storage policy are hashed in the manifest.
- The engine is `candidate` and `designBlocked`. M8 verification uses independent small-system Newmark implementations and an actual canonical 3D hardening-hinge frame, but it is not an external commercial-solver qualification.

## Regression Gate

- `node tools/run-phase8-tests.mjs M8`: PASS, including `NL-DYN-01` through `NL-DYN-16`.
- `node tools/run-phase8-tests.mjs --from=0 --to=8`: PASS.
- `node tools/run-phase7-tests.mjs`: PASS.
- Legacy milestone regression: M0 through M108 passed, the stale M7 Agent contract was regenerated from the M8 manifest, then M109 through the final milestone passed.
- `node tools/check-agent-contract.mjs` and `npm run test:p3docs`: PASS.

## Deferred By Design

- Spatially varying support motion and soil-structure interaction are outside M8.
- Consistent-mass condensation for released member ends is blocked.
- Full Phase 7 spring, offset, generated-member, unilateral-member and result-origin closure is P8-M9.
- Product setup UI, recovery charts, reporting and Agent execution workflow are P8-M10.
- External solver correlation, representative S/M/L model budgets and pilot acceptance are P8-M11.
- GPU kernels are not implemented. The M7/M8 backend contract remains opt-in and production requires deterministic float64 qualification without silent fallback.
