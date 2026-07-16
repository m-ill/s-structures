# 07 Nonlinear Analysis

## Supported Product Path

Use the **Production nonlinear workflow** for new Pushover and MDOF NLTH runs.
It uses the same schema-v5 model, nonlinear case, preflight, Worker engine,
result store, report contract, and Agent API. The older stepwise Pushover and
scalar SDOF Newmark tools remain available only as `legacy-preliminary` paths.

Production-path results are currently qualified as `candidate` and carry
`designBlocked: true`. They can be reviewed and exported, but must not be sent
to final design transfer until the remaining P8-M11 external numerical,
approved-scale performance, and project-pilot approval gates pass.

## Seven-Stage Workflow

1. **Basic setup**: choose Pushover or NLTH, direction, control method, and nonlinear case settings.
2. **Loads and mass**: confirm gravity preload, lateral pattern or ground motion, load combinations, and mass source.
3. **Hinges and sections**: review explicit assignments and any auto-assignment assumptions. Unsupported or incomplete sources are blocked by preflight.
4. **Model validation**: check constraints, support springs, offsets, releases, diaphragms, material/section sources, and active DOFs.
5. **First-order analysis**: confirm the elastic/gravity state used as the nonlinear initial state.
6. **Advanced analysis**: start the Worker job and monitor progress. Pause, cancel, retry, and checkpoint resume are exposed where the solver supports them.
7. **Results**: open the right-side result popup, compare current and historical runs, inspect convergence and stale status, and export the report or raw data.

The primary workflow button runs preflight before dispatch. Stable reason codes
identify blocked inputs, and the failure view links each reason to a corrective
stage. A changed model or case marks older results as stale instead of silently
reusing them.

## Result Views

Pushover views include the base-shear versus control-displacement capacity
curve, step and convergence history, story response, member force/deformation,
hinge/fiber state, and acceptance events. NLTH views include response history,
envelopes, energy and equilibrium audit, member/hinge/fiber history, substep
events, and checkpoint provenance.

Large histories are plotted with deterministic downsampling while preserving
extrema. CSV/JSON export and paged result slices retain the raw values. The
calculation report records the exact settings bytes, engine identity,
qualification, hashes, warnings, convergence trace, and stale status.

## Agent and MCP Contract

Automation uses the same product service as the UI. Read capabilities first,
then prefer these stable methods/actions:

The shared Phase 9 route is `getAnalysisCapabilities` ->
`validateAnalysisRun` -> `planAnalysisRun` -> `startAnalysisRun` ->
`getAnalysisRunStatus` -> `getAnalysisRunResult`. Use
`getAnalysisResultSlice`, `getAnalysisRunReport`, and
`exportAnalysisTelemetry` for bounded results and provenance. The older
`runPushover` action is retained only for compatibility and cannot enable GPU
or design transfer.

| Contract | Purpose |
| --- | --- |
| `validateProductionNonlinearCase` | Run product preflight without starting a job |
| `createProductionNonlinearCase` | Create or replace a schema-v5 nonlinear case |
| `previewNonlinearAssignments` / `applyNonlinearAssignments` | Review and apply deterministic hinge assignments |
| `startNonlinearRun` | Start a Worker-backed Pushover or NLTH job |
| `pauseNonlinearRun` / `cancelNonlinearRun` | Request job control at committed boundaries |
| `resumeNonlinearRun` / `retryNonlinearRun` | Continue from a supported checkpoint or retry |
| `getNonlinearRunStatus` / `listNonlinearRuns` | Read status, progress, provenance, and history |
| `getNonlinearRunGraph` | Read a bounded graph view for the selected response |
| `getNonlinearResultSlice` | Read bounded, paged, or downsampled result data |
| `getNonlinearResult` | Read the complete raw result when size is acceptable |
| `explainNonlinearFailure` | Resolve a stable failure code to corrective guidance |
| `exportNonlinearHistory` | Export raw CSV/JSON history with provenance |
| `getNonlinearReport` | Build the calculation-report contract used by the UI |

Do not infer success from a completed job alone. Check `qualification`,
`designBlocked`, `stale`, convergence, equilibrium audit, warnings, and source
hashes before interpreting or exporting a result.

When using `SStructuresAgent.execute`, the validation action is named
`validateNonlinearCase`; the direct read API alias is
`validateProductionNonlinearCase`.

## Current Limits

- P8-M11 independent reference code, production WASM measurement, and five input-to-report pilot runs are complete. External-program comparisons, pilot owner approvals, M-tier end-to-end Pushover/NLTH, and browser latency qualification remain blocked.
- Unilateral tension/compression-only members are explicitly unsupported in the production nonlinear active-set path and fail closed.
- Production Pushover pause restarts from its deterministic initial state; NLTH can resume only from a valid committed checkpoint.
- The GPU backend is an explicit future backend option. No GPU kernel is currently qualified, and the runtime does not silently fall back to another numerical path.
- Finite two-axis release behavior is restricted to its documented static qualification scope.
- Unsupported section, material, element, constraint, or source combinations are rejected by preflight rather than approximated silently.
