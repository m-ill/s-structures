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

`getPhase3PlanAlignment().status` only means the implementation is aligned with the written Phase 3 plan. Agents must also check `getPhase3PlanAlignment().productionReadiness.status`; `PRELIMINARY_REVIEW_REQUIRED` means the program remains a review/preliminary platform until the listed milestones and final approval fields are cleared.

Milestone review APIs and `getPhase3CompletionAuditReview()` expose `exitCriteria` rows with `exitCriteriaSummary`. `automated-exit-criteria-covered` means the written-plan exit criteria have regression evidence for that milestone. It does not override `remainingValidation`, `productionBlockers`, `finalUseBlockedBy`, `productionReady`, or any `finalApprovalField`.

`getLaunchReadinessReport().status` only means the launch evidence gates are green. Agents must also check `getLaunchReadinessReport().productionReadiness.status`; `OWNER_REVIEW_REQUIRED` means owner sign-off and production deployment approval are still required.

Agents should read `getLaunchReadinessReport().agentSafeStatus` before final-use automation. `LAUNCH_EVIDENCE_OK_FINAL_USE_BLOCKED` means the launch evidence is green, but practical validation, owner sign-off, or evidence-register review still blocks final structural-office use.

Agents must also inspect `getLaunchReadinessReport().finalUseReview`. `FINAL_USE_REVIEW_REQUIRED` means at least one practical validation, owner sign-off, or evidence-register review still blocks final structural-office use even when the automated launch gate is green.

For automation, read `getLaunchReadinessReport().finalUseReview.requiredReviews`.
Each row lists the required accepted field, current status, missing count, and
agent decision for practice validation, owner sign-off, and evidence-register
review.

`getPhase3EvidenceRegister().summary.evidenceComplete` only means the required field, engineering, and owner evidence rows have been accepted into the review register. It does not set `productionReady`, `productionDeploymentApproved`, or any final structural-office approval field. Project evidence API rows can use the evidence-register IDs; owner sign-off review accepts the corresponding aliases.

`submitProjectEvidence` accepts only the IDs listed in `getPhase3EvidenceRegister().rows` or the matching required evidence type labels. Unknown evidence IDs are rejected by both the server route and the in-page agent command bridge.

For file-backed drawing or point-cloud evidence, upload the file first and submit the returned `fileId` with the evidence row. Server-side evidence submission rejects unknown `fileId` values, and `createEvidenceClient().submitProjectEvidencePackage()` performs the upload-and-register sequence for API-driven agents.

`getPhase3DrawingImportValidationReview()` and `getPhase3PointCloudValidationReview()` expose project evidence under `evidenceCoverage` when called through the in-page agent. Evidence coverage shows accepted file/review records, but it does not replace candidate validation, overlay review, benchmark, or owner review rows.

`getPhase3PracticeValidationReview()` also summarizes project evidence by practical validation domain. Its `summary.missing` field lists domains whose required evidence IDs are not yet accepted; `productionReady` still remains false until owner and engineering approval is explicit.
The review keeps both `summary.requiredEvidenceCount` for the 21 practical
validation checklist phrases and `summary.requiredEvidenceIdCount` for the 25
submission IDs accepted by `getPhase3EvidenceRegister()`. Agents should submit
evidence by ID rather than inferring IDs from checklist text.
Final approval fields are separate from evidence acceptance. When an owner or
engineer explicitly approves a final field, submit the evidence row with
`finalApprovalField` and `approved: true` or `finalApprovalAccepted: true`.
Accepted evidence without that explicit approval flag keeps `productionReady`
and `productionDeploymentApproved` false.

Manual launch evidence remains in `reports/launch-readiness/`.
