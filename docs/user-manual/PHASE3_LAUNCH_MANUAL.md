# Phase 3 Launch Manual

manualVersion: 2026-07-02-phase3-launch

## Scope

S-Structures Phase 3 is a launch-readiness build for structural office review workflows. It supports native modeling, 3D elastic analysis, KDS-style load combinations, design-basis load derivation, preliminary nonlinear trace, detailed RC/steel/connection/foundation trace, calculation packages, DXF/point-cloud import scaffolds, and AI agent control.

The calculation package is a review artifact. It is not a sealed final structural calculation document.

## Main Workflow

1. Open `index.html` through the local web server.
2. Model the structure in the native S-Structures UI.
3. Set design-basis input and generate loads.
4. Generate rule-based load combinations.
5. Run elastic analysis.
6. Review result visuals, drift/serviceability, member trace, and detailed design trace.
7. Use `getP3IntegratedResults()` or the Calculation Package menu for integrated nonlinear/design/report state.
8. Record launch-readiness evidence under `reports/launch-readiness/`.

## Agent Workflow

AI agents should read these methods first:

1. `getCapabilities()`
2. `getSnapshot()`
3. `getScreenState()`
4. `getP3IntegratedResults()`
5. `getCalculationPackage()`

The canonical manual contract is `docs/user-manual/agent-contract.json`. The launch gate verifies that its `readApis` list matches `src/ui/agentManifest.js`, that manual execute actions are exposed by runtime `executeActions`, that import review workflows are exposed by runtime `readApis`, that QA commands match the manifest, and that the listed Phase 3 gate modules/data contracts are present in the manifest.

## Phase 3 Report Sections

The calculation package includes:

- design basis and loads
- elastic analysis summary
- Phase 3 integrated results
- member design summary
- detailing and foundation summary
- appendix and limitations

The Phase 3 integrated results section links result postprocessing, nonlinear trace, detailed design trace, issue rows, workflow lock state, and method limitations.

## Launch Review Rule

Before public release, run:

- `npm.cmd run test:p3`
- `npm.cmd run test:p3:list`
- `node tools/run-milestone-tests.mjs --phase3 --from=P3-M6 --to=P3-M20`

AI agents can read the same command set from `qaCommands` in `docs/user-manual/agent-contract.json` or `getCapabilities().qaCommands`.

## Review Gate Interpretation

AI agents should not treat `ok`, `readyForReviewer`, or `readyForOwnerReview` as final design approval. Read `getCapabilities().reviewGates` first, then inspect the listed review path:

- `geometryGate.solverReview`
- `hingeControlGate.controlReview`
- `fiberNlthGate.fiberNlthReview`
- `rcDesignGate.rcReview`
- `designGate.designReview`
- `integratedGate.integratedReview`
- `releaseGate.releaseReview`

The `readyDecision` values mean the next review step may proceed. The listed `finalApprovalField` values remain false until owner or engineer sign-off is recorded outside the automated gate.

Manual launch evidence remains in `reports/launch-readiness/`.
