# ADR-011: Production Nonlinear Workflow, Job, Result and Automation Contract

## Status

Accepted for P8-M10 on 2026-07-14. This decision completes the product workflow but does not promote any nonlinear result to `verified`.

## Context

P8-M5 and P8-M8 provide production-candidate Pushover and MDOF NLTH engines, while P8-M9 binds them to the Phase 7 canonical model and integrated result contracts. A production user surface must not create a second material, section, load or mass model; must not run a different solver through Agent/MCP; and must distinguish a completed computation from a result qualified for design transfer.

Long nonlinear runs also need immediate acknowledgement, progress, safe pause/cancel, deterministic restart rules, bounded result access and historical/stale provenance. Rendering a large raw history directly is incompatible with responsive browser UI, but reducing exported engineering data is unacceptable.

## Decision

1. `createNonlinearProductService` is the common application boundary for UI, Agent and command-bridge callers. All callers use the same normalized analysis case, preflight, engine ID, settings bytes, qualification and result-access functions.
2. Product execution uses a module Worker and the in-house production sparse backend. A missing Worker/WASM capability blocks execution; the UI never silently falls back to a main-thread or reference solver.
3. The setup workflow has seven fixed stages: model, gravity, nonlinear properties, control, ground motion, run and results. Existing Phase 7 material/section and load/mass editors are linked instead of duplicated.
4. Automatic steel hinge generation is an explicit `assumed` preview based on the project material/section snapshot. Its source assumption and override diff are shown, and the model changes only after user or Agent approval. RC members still require an explicit reinforcement snapshot.
5. The run contract is asynchronous. `start` returns a job immediately; status events are monotonic. NLTH can resume only from a valid checkpoint with an unchanged model hash. Pushover pause/retry restarts from the origin until a separately qualified static checkpoint contract exists.
6. Cancellation occurs at committed boundaries. A retained checkpoint is exposed in the job record. Worker/reference or legacy fallback is forbidden.
7. Results are accessed by overview, capacity, history, envelope, story, member, node, hinge, convergence and provenance slices. Chart histories use deterministic min/max bucket downsampling that preserves extrema. CSV/JSON exports always use raw retained rows.
8. The movable/resizable/snapping result popup and elastic result popup share `SStructuresResultSelection`, case IDs and object IDs. Historical and stale results remain inspectable but are marked and remain blocked from design transfer.
9. Calculation reports record model/settings hashes, exact settings-byte parity, inputs, algorithm, tolerances, backend/thread, convergence, warnings, qualification and design-block reason.
10. M10 qualification remains `candidate` with `designBlocked:true`. Only P8-M11 independent verification, scale and pilot gates can change that status.

## Rejected Alternatives

- A separate nonlinear model editor was rejected because it would allow topology, property, load and mass drift from Phase 7.
- A synchronous `run()` API was rejected because it cannot provide responsive UI, committed-boundary cancellation or progress streaming.
- Main-thread/reference fallback was rejected because it changes numerical and performance behavior without user-visible provenance.
- Plotting or exporting only downsampled histories was rejected because peaks and audit rows must remain available in raw form.
- Treating `completed` as `verified` was rejected because M10 is workflow qualification, not independent numerical qualification.

## Consequences

- UI and automation can reproduce the same case and settings hash.
- Large histories remain navigable without weakening raw export fidelity.
- Stale and historical results are useful for audit while remaining fail-closed for design transfer.
- Pushover does not yet resume from a mid-path checkpoint; the UI states that retry starts from the origin.
- Representative-building latency, memory, crash recovery and independent solver comparison remain P8-M11 gates.

## Verification

- `tests/p8-m10-product-preflight.mjs`
- `tests/p8-m10-job-agent-api.mjs`
- `tests/p8-m10-result-access.mjs`
- `tests/p8-m10-product-ui.mjs`
- `verification/evidence/validation/phase8/p8-m10-ui-api.json`
